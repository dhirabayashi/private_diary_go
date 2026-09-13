# 自動保存の競合解消 設計ドキュメント

## 1. 背景

自動保存機能において、入力内容の一部が保存後に古い内容へ「巻き戻る」事象が報告されている。調査の結果、性質の異なる2つの問題が見つかった。**実際に報告された症状（手動保存を一切行っていないのに再現する）の直接の原因は問題A**であり、問題Bは調査の過程で見つかった、別種の・理論上のリスクである。

### 1.1 問題A（確定・最優先）: 自動保存が自己作成したエントリを「既存エントリ」と誤認し、編集中の画面を強制的に差し替えてしまう

再現に手動保存は一切不要。以下の操作だけで発生する。

```
1. /new で新規の日記を書き始める（今日の日付、まだサーバーには何もない）
2. 30秒後、自動保存が発火して entries.create() が成功し、サーバーに最初の内容が保存される
3. ユーザーはそのまま入力を続ける（例：「今日は晴れ。散歩に行った。」まで書き足す）
4. ユーザーが一瞬他のアプリ／別タブに切り替える（通知確認、コピペ元を見る等のごく普通の操作）
5. ブラウザに戻ってくる → ウィンドウが focus を取り戻す
6. useEntry(today) の staleTime(30秒) は手順2〜4の間にとっくに超過しているため、
   refetchOnWindowFocus のデフォルト挙動でバックグラウンド再フェッチが走る
7. 再フェッチが GET /api/entries/{today} を叩くと、手順2で自動保存が既に作成済みのため
   200 OK でエントリが返る → existingEntry が undefined → Entry に変化
8. NewEntryPage の useEffect が反応し、navigate(`/${today}/edit`, { replace: true }) を実行
9. NewEntryPage（および中の EntryForm・useAutoSave）がアンマウントされ、
   EditEntryPage が defaultValues={{ body: entry.body }} で新規マウントされる
   → entry.body は手順2で保存された古い内容（「今日は晴れ」のみ）
10. 画面上のテキストエリアの表示内容が、手順3で書き足した分を含まない古い内容に「巻き戻る」
```

サーバー側は何も間違えていない。保存自体は1回しか行われておらず競合もしていない。**フロントエンドが「自分がついさっき自動作成した投稿」を、あたかも「他所で作られた既存の投稿を発見した」かのように誤認し、編集中の画面ごと差し替えてしまっている**のが直接原因である。

根拠となったコード:

- `frontend/src/App.tsx`: `QueryClient`は`staleTime: 30_000`のみ明示指定、`refetchOnWindowFocus`はv5のデフォルト（`true`）のまま。
- `frontend/src/hooks/useEntries.ts` `useEntry`: `queryKey: ['entry', date]`、`staleTime`は未指定（Appのデフォルト30秒を継承）。
- `frontend/src/pages/NewEntryPage.tsx` L17-23:
  ```tsx
  const { data: existingEntry } = useEntry(selectedDate)

  useEffect(() => {
    if (existingEntry) {
      navigate(`/${existingEntry.entry_date}/edit`, { replace: true })
    }
  }, [existingEntry, navigate])
  ```
  依存配列が `[existingEntry, navigate]` であるため、この`useEffect`は**初回マウント時に限らず、`existingEntry`が変化するたびに毎回反応する**。バックグラウンド再フェッチで後からtruthyに変わった場合も同様に発火する。
- `frontend/src/App.tsx`のルーター定義（`createBrowserRouter`）で`/new`と`/:date/edit`は完全に別ルート・別コンポーネントであり、ネストもしていない。したがって`navigate`が起きると`EntryForm`（＝`useAutoSave`インスタンス）は丸ごとアンマウント→リマウントされ、入力中の状態は`EditEntryPage`側の`defaultValues`（＝GET時点のサーバー内容）で完全に上書きされる。

### 1.2 問題B（副次的発見・理論上のリスク）: 手動保存と自動保存の書き込み競合、および複数タブ間の競合

調査の過程で、以下のような**手動投稿を伴う場合や複数タブを開いた場合には**別の巻き戻りリスクがあることも判明した。今回報告された症状の直接原因ではないが、修正のついでに対処しておく価値がある。

- `internal/infra/sqlite/entry.go` の`Update`は`WHERE entry_date = ?`のみの無条件UPDATEで、サーバー側に「どちらが新しい内容か」を判定する手段がない（last-write-wins）。
- `frontend/src/hooks/useAutoSave.ts` の`awaitCurrentSave`は、呼び出し時点で既にin-flightな保存しか待てないスナップショット的なチェックで、双方向の排他にはならない。
- 同一エントリを複数タブで開いた場合、各タブが独立して自動保存状態を持つため、互いの存在を知らないまま最後にサーバーへ到達したリクエストが勝ってしまう。

## 2. 対処方針の全体像

| 優先度 | 対象 | 対応方針 |
|---|---|---|
| **最優先** | 問題A | フロントエンドのみで完結する修正。誤検知によるリダイレクトを止める（3章） |
| 中期 | 問題B | サーバー側の楽観ロック（バージョン管理）＋クライアント側の保存キュー直列化（4章）。今回の症状の直接原因ではないが、複数タブ利用や将来の変更に対する保険として実施する |

## 3. 問題Aの修正設計

### 3.1 方針

`NewEntryPage`の「既存エントリへのリダイレクト」は、本来「`/new`を開いた瞬間、その日付に既にサーバー上へ投稿がある」場合の救済用である。開いた後にバックグラウンド再フェッチで存在が判明したケース（＝実態はほぼ自分自身の自動保存によって作られたケース）まで拾う必要はない。以下の2つを組み合わせて対処する。

#### 対策1: 自動保存が自己作成したエントリでは二度とリダイレクトしない

`useAutoSave`は既に`autoCreated`（自動保存でエントリを新規作成したかどうか）を内部で管理している（`useAutoSave.ts` L34, L64, L94）。この状態を`EntryForm`経由で`NewEntryPage`からも参照できるようにし、一度`autoCreated`になった後はリダイレクト判定自体を行わないようにする。

```tsx
// frontend/src/components/features/EntryForm.tsx
export interface EntryFormHandle {
  getCreatedDate: () => string | null
  awaitCurrentSave: () => Promise<void>
  isAutoCreated: () => boolean // 追加
}

// ...
useImperativeHandle(ref, () => ({ getCreatedDate, awaitCurrentSave, isAutoCreated: () => autoCreated }))
```

```tsx
// frontend/src/pages/NewEntryPage.tsx
useEffect(() => {
  if (existingEntry && !formRef.current?.isAutoCreated()) {
    navigate(`/${existingEntry.entry_date}/edit`, { replace: true })
  }
}, [existingEntry, navigate])
```

これにより、「自動保存が作った自分自身のエントリ」を検知しても遷移しなくなる。一方、「ユーザーが日付を過去の既存投稿がある日に変更した」ような本来のユースケース（自分で作ったものではない既存エントリの発見）では従来通り遷移する。

#### 対策2: そもそも編集中にこのクエリをバックグラウンド再フェッチしない

`NewEntryPage`における`useEntry(selectedDate)`は「`/new`を開いた瞬間に既存投稿がないか一度だけ確認する」目的にしか使われていない。継続的な最新化は不要であり、ウィンドウフォーカス時の再フェッチ自体を止めることで、対策1が万一漏れていても同種の問題が起きないようにする（多層防御）。

```tsx
// frontend/src/hooks/useEntries.ts
export function useEntry(date: string, options?: { refetchOnWindowFocus?: boolean }) {
  return useQuery({
    queryKey: ['entry', date],
    queryFn: () => entries.getByDate(date),
    enabled: !!date,
    retry: false,
    refetchOnWindowFocus: options?.refetchOnWindowFocus ?? true,
  })
}
```

```tsx
// frontend/src/pages/NewEntryPage.tsx
const { data: existingEntry } = useEntry(selectedDate, { refetchOnWindowFocus: false })
```

`EditEntryPage`側の`useEntry(date)`呼び出しは変更不要。`EditEntryPage`は取得した`entry`を`EntryForm`の`defaultValues`としてマウント時に一度使うのみで、react-hook-formはマウント後の`defaultValues`変化に追従しない（＝バックグラウンド再フェッチが走っても、表示中のフォーム内容が横から書き換わることはない）ため、実害がない。

### 3.2 修正後のフロー（確認用）

対策1・2を両方適用すると、1.1節のシナリオは以下のように変わる。

```
1〜3. （変更なし）自動保存が発火し、サーバーに最初の内容が保存される。autoCreated が true になる
4〜5. ユーザーがタブを切り替えて戻ってくる
6.    useEntry は refetchOnWindowFocus: false のため再フェッチされない（対策2）
      → 万一何らかの理由で再フェッチされても、autoCreated が true なので useEffect は navigate しない（対策1）
7.    ユーザーは /new 画面のまま入力を継続でき、次の自動保存tickで最新内容が保存される
```

## 4. 問題Bへの対処（複数タブ・手動保存との競合に対する保険）

以下の2層で対策する。**片方だけでも改善はするが、両方揃えて初めて「本格対応」とする。**

1. **サーバー側: 楽観ロック（optimistic locking）**
   バージョン番号を導入し、クライアントが把握している版と異なる版への更新を拒否する。
   同一タブ内の競合はもちろん、複数タブ・複数デバイスからの競合も含めて確実に検知できる、最終防衛ラインとなる。

2. **クライアント側: 保存リクエストの直列化（single-flight queue）**
   自動保存・手動投稿を問わず、1つのエントリに対する保存要求を**すべて単一のキューを通す**ことで、
   同一タブ内では常に高々1本のリクエストしか飛ばないようにする。これにより通常運用時の競合はほぼゼロになり、
   サーバー側の楽観ロックは「異常系・複数タブ」の保険として機能する。

冗長に見えるが、フロントだけの対策は「複数タブ」を救えず、サーバーだけの対策は「同一タブ内の無駄な409エラー」を
ユーザーに露出させてしまう。両方揃えることで平常時は競合が起きず、起きた場合も安全に検知できる。

### 4.1 サーバー側設計: 楽観ロック

#### 4.1.1 スキーマ変更

`entries` テーブルに `version` カラムを追加する。新規作成時は `1`、更新の度に `+1` する。

```sql
ALTER TABLE entries ADD COLUMN version INTEGER NOT NULL DEFAULT 1
```

このプロジェクトはマイグレーション管理の仕組みを持たず、`internal/infra/db/sqlite.go` の `migrate()` が
起動の度に `CREATE TABLE IF NOT EXISTS` を実行する方式である。`ALTER TABLE ADD COLUMN` は同じ列に対して
2回実行するとエラーになるため、`PRAGMA table_info` でカラムの存在を確認してから実行するガードを追加する。

```go
// internal/infra/db/sqlite.go
func migrate(db *sql.DB) error {
	stmts := []string{
		`PRAGMA journal_mode=WAL`,
		`CREATE TABLE IF NOT EXISTS entries (
			id         INTEGER PRIMARY KEY AUTOINCREMENT,
			entry_date TEXT    NOT NULL UNIQUE,
			body       TEXT    NOT NULL DEFAULT '',
			version    INTEGER NOT NULL DEFAULT 1,
			created_at TEXT    NOT NULL,
			updated_at TEXT    NOT NULL
		)`,
		// images テーブルは変更なし
	}
	for _, stmt := range stmts {
		if _, err := db.Exec(stmt); err != nil {
			return fmt.Errorf("exec %q: %w", stmt[:min(len(stmt), 40)], err)
		}
	}
	return addVersionColumnIfMissing(db)
}

// 既存DB（version列を持たない）を起動時に一度だけ移行する。
func addVersionColumnIfMissing(db *sql.DB) error {
	var count int
	err := db.QueryRow(
		`SELECT COUNT(*) FROM pragma_table_info('entries') WHERE name = 'version'`,
	).Scan(&count)
	if err != nil {
		return fmt.Errorf("check version column: %w", err)
	}
	if count > 0 {
		return nil
	}
	if _, err := db.Exec(`ALTER TABLE entries ADD COLUMN version INTEGER NOT NULL DEFAULT 1`); err != nil {
		return fmt.Errorf("add version column: %w", err)
	}
	return nil
}
```

新規テーブル作成（`CREATE TABLE`）にも `version` を含めておくことで、まっさらな環境では
`ALTER TABLE` は「既に存在するので何もしない」分岐に入り、既存DBでは1回だけ列追加が走る。

#### 4.1.2 Model / Repository 変更

```go
// internal/model/entry.go
type Entry struct {
	ID        int64     `json:"id"`
	Date      string    `json:"entry_date"`
	Body      string    `json:"body"`
	Version   int       `json:"version"` // 追加
	Preview   string    `json:"preview,omitempty"`
	Images    []*Image  `json:"images,omitempty"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
```

`EntryRepository.Update` は「期待するバージョン」を受け取り、条件付きUPDATEを行う。
更新できた行数（`RowsAffected`）が0であれば、バージョン不一致（＝競合）とみなす。

```go
// internal/repository/entry.go
type EntryRepository interface {
	FindByDate(ctx context.Context, date string) (*model.Entry, error)
	List(ctx context.Context, params model.ListParams) ([]*model.Entry, int, error)
	Save(ctx context.Context, entry *model.Entry) error
	// Update は expectedVersion と一致する行のみ更新し、更新できたら true を返す。
	Update(ctx context.Context, entry *model.Entry, expectedVersion int) (bool, error)
	Delete(ctx context.Context, date string) error
	ExistsDate(ctx context.Context, date string) (bool, error)
	ListForExport(ctx context.Context, from, to string) ([]*model.Entry, error)
}
```

```go
// internal/infra/sqlite/entry.go
func (r *entryRepository) Update(ctx context.Context, entry *model.Entry, expectedVersion int) (bool, error) {
	result, err := r.db.ExecContext(ctx,
		`UPDATE entries SET body = ?, updated_at = ?, version = version + 1
		 WHERE entry_date = ? AND version = ?`,
		entry.Body, entry.UpdatedAt.Format(time.RFC3339), entry.Date, expectedVersion,
	)
	if err != nil {
		return false, err
	}
	n, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return n > 0, nil
}
```

`Save`（Create用INSERT）についても、`ExistsDate` による事前チェックには
TOCTOU（check-then-act）の隙間が残るため、DBのUNIQUE制約違反を確実に拾って
`ErrDuplicateDate` にマッピングする防御を追加する（多重タブでの同時初回作成に対する保険）。

```go
func (r *entryRepository) Save(ctx context.Context, entry *model.Entry) error {
	result, err := r.db.ExecContext(ctx,
		`INSERT INTO entries (entry_date, body, version, created_at, updated_at) VALUES (?, ?, 1, ?, ?)`,
		entry.Date, entry.Body,
		entry.CreatedAt.Format(time.RFC3339),
		entry.UpdatedAt.Format(time.RFC3339),
	)
	if err != nil {
		if isUniqueConstraintErr(err) {
			return repository.ErrConflict
		}
		return err
	}
	id, err := result.LastInsertId()
	if err != nil {
		return err
	}
	entry.ID = id
	entry.Version = 1
	return nil
}
```

#### 4.1.3 Service層

```go
// internal/service/errors.go
var (
	// 既存のエラーに追加
	ErrVersionConflict = errors.New("他の変更と競合しました。最新の内容を確認してください")
)
```

```go
// internal/service/entry.go
func (s *entryService) Update(ctx context.Context, date, body string, expectedVersion int) (*model.Entry, error) {
	entry, err := s.repo.FindByDate(ctx, date)
	if err != nil {
		return nil, err
	}
	if entry == nil {
		return nil, ErrNotFound
	}

	entry.Body = body
	entry.UpdatedAt = time.Now()

	ok, err := s.repo.Update(ctx, entry, expectedVersion)
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrVersionConflict
	}
	entry.Version = expectedVersion + 1
	return entry, nil
}

func (s *entryService) Create(ctx context.Context, date, body string) (*model.Entry, error) {
	// ...既存のバリデーション...
	if err := s.repo.Save(ctx, entry); err != nil {
		if errors.Is(err, repository.ErrConflict) {
			return nil, ErrDuplicateDate
		}
		return nil, err
	}
	return entry, nil
}
```

`EntryService` インターフェースの `Update` シグネチャに `expectedVersion int` を追加する。

#### 4.1.4 Handler / APIコントラクト

`PUT /api/entries/{date}` のリクエストボディに `version` を必須化する。

```jsonc
// リクエスト
{ "body": "更新後の本文", "version": 3 }

// 成功レスポンス（既存の形式を踏襲）
{ "data": { "entry_date": "2024-01-01", "body": "...", "version": 4, ... } }

// 競合時レスポンス（新規）
// HTTP 409 Conflict
{ "error": { "code": "VERSION_CONFLICT", "message": "他の変更と競合しました。最新の内容を確認してください" } }
```

```go
// internal/handler/entry.go
func (h *EntryHandler) Update(w http.ResponseWriter, r *http.Request) {
	date := chi.URLParam(r, "date")
	var req struct {
		Body    string `json:"body"`
		Version int    `json:"version"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "INVALID_REQUEST", err.Error())
		return
	}

	entry, err := h.entryService.Update(r.Context(), date, req.Body, req.Version)
	if err != nil {
		switch {
		case errors.Is(err, service.ErrNotFound):
			respondError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
		case errors.Is(err, service.ErrVersionConflict):
			respondError(w, http.StatusConflict, "VERSION_CONFLICT", err.Error())
		default:
			respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		}
		return
	}
	// ...既存の画像取得・レスポンス処理...
}
```

`GET /api/entries/{date}` および一覧APIのレスポンスにも `version` フィールドが自然に含まれる
（`model.Entry` に `Version` を追加するだけで良い）。

### 4.2 クライアント側設計: 保存リクエストの直列化

#### 4.2.1 現状の問題点（再掲）

`useAutoSave.ts` の `inFlightRef` は「自動保存タイマー自身の多重発火」しか防いでおらず、
手動投稿（`NewEntryPage`/`EditEntryPage` の `handleSubmit`）が発行するリクエストはこの排他制御の
対象外になっている。`awaitCurrentSave()` も「呼ばれた瞬間に飛んでいる保存」しか待てないスナップショット的な
チェックであり、双方向の排他にはならない。

#### 4.2.2 方針: 単一の保存チャネルに統合する

自動保存・手動投稿の両方が、同じ「保存キュー」を経由するように再設計する。キューの規約は以下の通り。

- 常に **高々1本** のPUT/POSTしかサーバーへ送らない（同一タブ内）。
- 保存中に新たな保存要求（自動保存のtickでも手動投稿でも）が来たら、リクエストを追加送信せず
  次の「ラウンド」に合流させ、最新の内容だけを覚えておく。進行中のリクエストが完了した時点で、
  次のラウンドがあれば直ちに最新内容で実行する（＝末尾のみ生き残るcoalescing）。
- 各保存は直前に成功したレスポンスの `version` を付けて送る。409が返ったら自動保存を停止し、
  competing edit（競合編集）状態としてユーザーに通知する。
- 呼び出し元ごとに、**自分の保存が実際に実行されたラウンドの結果**（成功/失敗）を返す。
  同じラウンドに合流した呼び出し元同士は同じ結果を受け取るが、別ラウンドの失敗が
  無関係な呼び出し元に伝播することはない。

```ts
// frontend/src/hooks/useAutoSave.ts（再設計後のイメージ）
interface UseAutoSaveOptions {
  date: string
  body: string
  existingDate?: string
  initialBody?: string
  initialVersion?: number // 追加：既存エントリ編集時、GET時点のversionを渡す
  intervalMs?: number
}

// 1回の保存試行（＝1ラウンド）に対応するPromiseと、それを解決する手段の組。
// 「保存不要でスキップした」場合も含め、必ずこのラウンドのresolve/rejectを呼び切る
// （呼び忘れると、このラウンドを待っている呼び出し元のPromiseが永遠に解決しなくなる）。
type Round = {
  promise: Promise<void>
  resolve: () => void
  reject: (e: unknown) => void
}

function createRound(): Round {
  let resolve!: () => void
  let reject!: (e: unknown) => void
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

function useAutoSave({ date, body, existingDate, initialBody, initialVersion, intervalMs = 30000 }: UseAutoSaveOptions) {
  const queryClient = useQueryClient() // 現行実装同様、['entries']一覧キャッシュの無効化に使う
  const versionRef = useRef<number | null>(initialVersion ?? null)
  const activeRoundRef = useRef<Round | null>(null) // 実行中のラウンド
  const nextRoundRef = useRef<Round | null>(null)   // 実行中の完了後に続けて実行するラウンド
  const valuesRef = useRef({ date, body })
  const lastSavedBodyRef = useRef(initialBody ?? null)
  const createdDateRef = useRef(existingDate ?? null)
  const [status, setStatus] = useState<AutoSaveStatus>('idle')
  // 3章対策1（isAutoCreated）の土台。既存の autoCreated state を再設計後もそのまま維持する
  // （既存エントリ編集時に既に自動生成されているわけではないため、既存実装同様 false 始まりでよい）。
  const [autoCreated, setAutoCreated] = useState(false)
  const statusRef = useRef(status)
  useEffect(() => { statusRef.current = status })

  useEffect(() => { valuesRef.current = { date, body } })

  // 1ラウンド分の保存を実行し、resolve/rejectしてラウンドを閉じる。
  // 閉じた時点で次のラウンドが積まれていれば、そのまま続けて実行する。
  const runRound = useCallback(async (round: Round) => {
    const settle = (finish: () => void) => {
      finish()
      activeRoundRef.current = null
      const next = nextRoundRef.current
      if (next) {
        nextRoundRef.current = null
        activeRoundRef.current = next
        runRound(next)
      }
    }

    const { date: currentDate, body: currentBody } = valuesRef.current
    if (!currentBody.trim()) return settle(round.resolve)
    if (createdDateRef.current !== null && lastSavedBodyRef.current === currentBody) {
      return settle(round.resolve)
    }

    setStatus('saving')
    try {
      if (createdDateRef.current === null) {
        const entry = await entries.create({ date: currentDate, body: currentBody })
        createdDateRef.current = entry.entry_date
        versionRef.current = entry.version
        setAutoCreated(true)
        queryClient.invalidateQueries({ queryKey: ['entries'] })
      } else {
        const entry = await entries.update(createdDateRef.current, currentBody, versionRef.current!)
        versionRef.current = entry.version
        // NOTE: ['entry', date] は現行実装同様、意図的に無効化しない（3.1節の理由と同じ）。
        queryClient.invalidateQueries({ queryKey: ['entries'] })
      }
      lastSavedBodyRef.current = currentBody
      setStatus('saved')
      settle(round.resolve)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') {
        setStatus('conflict') // 自動保存タイマーはこの状態では発火させない
      } else {
        console.error('自動保存に失敗しました', e)
        setStatus('error')
      }
      settle(() => round.reject(e))
    }
  }, [])

  // 自動保存・手動投稿の両方が呼び出す唯一の入口。
  // 呼び出しごとに、自分の保存が実行されるラウンドに対応したPromiseを返す。
  const requestSave = useCallback((): Promise<void> => {
    if (activeRoundRef.current) {
      if (!nextRoundRef.current) nextRoundRef.current = createRound()
      return nextRoundRef.current.promise
    }
    const round = createRound()
    activeRoundRef.current = round
    runRound(round)
    return round.promise
  }, [runRound])

  useEffect(() => {
    // 依存配列に status を入れると、保存サイクルのたびに（saving→saved等）エフェクトが
    // 再生成されてタイマーがリセットされ、「一定間隔で保存」ではなく「前回の保存完了から
    // intervalMs後に保存」という別物の挙動になってしまう。そのため conflict 判定は
    // statusRef 経由で行い、このエフェクト自体は intervalMs（と requestSave の同一性）にのみ依存させる。
    const id = setInterval(() => {
      if (statusRef.current === 'conflict') return // 競合解消までは自動保存を止める
      // インターバル発火分の失敗は status で表現済みなので、ここでは握りつぶして
      // unhandled rejection を防ぐ（reject を伝えるべき相手は手動投稿の呼び出し元のみ）。
      requestSave().catch(() => {})
    }, intervalMs)
    return () => clearInterval(id)
  }, [intervalMs, requestSave])

  return {
    status,
    autoCreated,
    getCreatedDate: () => createdDateRef.current,
    getVersion: () => versionRef.current,
    // 手動投稿はこれを呼ぶだけでよい。内部で自動保存と同じキューに乗る。
    save: requestSave,
  }
}
```

ポイント:

- `queryClient.invalidateQueries({ queryKey: ['entries'] })` は現行実装の挙動をそのまま維持する。
  `['entry', date]` を無効化しない理由も現行のまま（3.1節：バックグラウンド再フェッチによる
  意図しないリダイレクトを防ぐため）。
- `entries.update` はAPI変更に合わせて `version` を引数に取るようにする（`frontend/src/api/entries.ts`）。
- 手動投稿側（`NewEntryPage`/`EditEntryPage`）は `awaitCurrentSave()` を呼ぶのではなく、
  **`save()`（＝`requestSave`）を直接呼ぶ**ように変更する。これにより手動投稿自体が
  キューの一員になり、「投稿中に自動保存が割り込む」余地がなくなる。
- `requestSave()`が返すPromiseは、呼び出し元が合流したラウンド固有のものであり、そのラウンドの
  成功/失敗をそのまま反映する。`handleSubmit`は`await save()`を`catch`してエラートーストを出せる。
  自動保存の定期実行（`setInterval`側）はrejectを`.catch(() => {})`で握りつぶす（実際の失敗通知は
  `status`で行うため、誰も待っていないここでのrejectはunhandled rejection化を防ぐだけでよい）。
- 「保存不要でスキップ」する2つの早期return（本文が空／前回から変化なし）も、必ず`round.resolve()`
  を呼んでからラウンドを閉じる。ここを怠ると、そのラウンドに合流していた呼び出し元の`await save()`
  が永遠に解決しなくなる。
- `VERSION_CONFLICT` を受け取ったら自動保存タイマーを止め、`status: 'conflict'` をUIに伝える。
  UI側は「他の場所で更新されています。再読み込みして最新の内容を確認してください」といった
  バナーを表示し、再読み込み導線を提供する（4.2.4節）。
- `EditEntryPage`は`useEntry(date)`で取得済みの`entry.version`を`EntryForm`（`autoSaveInitialVersion`
  prop）経由で`useAutoSave`の`initialVersion`に渡す。
- 3章対策1で導入した`autoCreated` state（新規作成が自動保存で完了したかどうか）は、再設計後も
  そのまま維持する。`EntryForm`の日付欄の`readOnly={dateReadOnly || autoCreated}`判定と、
  `EntryFormHandle.isAutoCreated()`（3.1節）はこの`autoCreated`に依存しているため、ここが
  欠落すると問題Aの修正自体が退行する。`useAutoSave`の戻り値にも`autoCreated`を含める。
- 保存インターバルの`useEffect`は`intervalMs`と`requestSave`のみに依存させ、`status`を依存配列に
  入れない。`status`を入れると保存サイクル（saving→saved等）のたびにエフェクトが再生成されて
  タイマーがリセットされ、「一定間隔で保存」ではなく「前回の保存完了からintervalMs後に保存」という
  別の挙動になってしまう。conflict時に発火を止める判定は`statusRef`（毎レンダー後に同期するref）
  経由で行う。

#### 4.2.2.1 既存エントリの初期versionの受け渡し

`initialVersion` は`useAutoSave`の外（`EntryForm`のprops）から渡す必要がある。

```tsx
// frontend/src/components/features/EntryForm.tsx
interface EntryFormProps {
  defaultValues?: Partial<FormValues>
  onSubmit: (values: FormValues) => Promise<void>
  submitLabel?: string
  dateReadOnly?: boolean
  autoSaveExistingDate?: string
  autoSaveInitialVersion?: number // 追加
  onDateChange?: (date: string) => void
}

// ...
const { status: autoSaveStatus, autoCreated, getCreatedDate, save } = useAutoSave({
  date: watchedDate ?? '',
  body: watchedBody ?? '',
  existingDate: autoSaveExistingDate,
  initialBody: defaultValues?.body,
  initialVersion: autoSaveInitialVersion, // 追加
})
```

#### 4.2.2.2 EntryFormHandle・呼び出し側の追従

`useAutoSave`が`awaitCurrentSave`ではなく`save`を返すようになるため、3.1節で定義した
`EntryFormHandle`もこれに合わせて更新する（`awaitCurrentSave`は`save`に置き換わり、
`isAutoCreated`はそのまま維持）。

```tsx
// frontend/src/components/features/EntryForm.tsx
export interface EntryFormHandle {
  getCreatedDate: () => string | null
  save: () => Promise<void> // awaitCurrentSave から置き換え
  isAutoCreated: () => boolean
}

// ...
useImperativeHandle(ref, () => ({ getCreatedDate, save, isAutoCreated: () => autoCreated }))
```

`NewEntryPage`/`EditEntryPage`の`handleSubmit`は、`awaitCurrentSave()`で自動保存の完了を待ってから
別途`createEntry`/`updateEntry`を呼んでいた従来の2段階の処理を、`formRef.current.save()`の呼び出し
1回に置き換える。保存後の遷移先・投稿先の日付は引き続き`getCreatedDate()`（新規作成時）や`date`
パラメータ（編集時）から取得できるため、`save()`の解決後にそれらを参照して`navigate`する。

```tsx
// frontend/src/pages/NewEntryPage.tsx（handleSubmitの変更イメージ）
const handleSubmit = async () => {
  try {
    await formRef.current?.save()
    const savedDate = formRef.current?.getCreatedDate()
    showToast('日記を投稿しました')
    navigate(`/${savedDate}`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : '投稿に失敗しました'
    showToast(msg, 'error')
  }
}
```

```tsx
// frontend/src/pages/EditEntryPage.tsx
<EntryForm
  ref={formRef}
  defaultValues={{ date: entry.entry_date, body: entry.body }}
  onSubmit={handleSubmit}
  submitLabel="更新する"
  dateReadOnly
  autoSaveExistingDate={entry.entry_date}
  autoSaveInitialVersion={entry.version} // 追加
/>
```

`NewEntryPage`側は新規作成のため`autoSaveInitialVersion`を渡さない（`initialVersion`は`undefined`のままでよく、初回`create`のレスポンスで`versionRef`が初期化される）。

#### 4.2.3 API層の変更

```ts
// frontend/src/api/entries.ts
update: (date: string, body: string, version: number) =>
  fetchJson<Entry>(`/api/entries/${date}`, {
    method: 'PUT',
    body: JSON.stringify({ body, version }),
  }),
```

`Entry` 型（`frontend/src/types/api.ts`）に `version: number` を追加する。

#### 4.2.4 競合発生時のUX

個人利用の日記アプリであり複数人での同時編集は想定しないため、リアルタイムなマージUIまでは実装せず、
シンプルな「検知して知らせる」レベルに留める。

- 自動保存または手動投稿が409を受け取ったら、フォーム上部に赤系のバナーを表示する。
  「他のタブ/端末での変更を検知しました。このまま保存すると上書きされる可能性があります。」
- ボタンは2つ:
  - 「最新の内容を読み込み直す」（現在の入力内容を破棄し、サーバーの最新版を取得して置き換える）
  - 「このまま自分の内容で保存する」（`version` をサーバーの最新値に更新した上で強制的に再送する。
    他者の変更を上書きしうる破壊的操作のため、実行前に確認ダイアログを挟み誤操作を防ぐ。
    具体的なUI設計は4.2.4.4節を参照）
- 自動保存タイマーは競合解消（いずれかのボタン操作）まで停止する。無限に409を出し続けるのを防ぐため。

以降、この2つのボタンを実現するためのAPI設計を示す。

#### 4.2.4.1 バックエンド: 409レスポンスにサーバー側の現在versionを含める

「このまま自分の内容で保存する」を実装するには、クライアントが競合時点のサーバー側version値を
知る必要がある。4.1.3節の`ErrVersionConflict`を、現在versionを保持できる型に拡張する。

```go
// internal/service/errors.go
var ErrVersionConflict = errors.New("他の変更と競合しました。最新の内容を確認してください")

// VersionConflictError は ErrVersionConflict をラップし、競合時点のサーバー側versionを保持する。
// errors.Is(err, ErrVersionConflict) は Unwrap 経由で従来通り true になる。
type VersionConflictError struct {
	CurrentVersion int
}

func (e *VersionConflictError) Error() string { return ErrVersionConflict.Error() }
func (e *VersionConflictError) Unwrap() error  { return ErrVersionConflict }
```

以下は4.1.3節で示した`entryService.Update`を**置き換える**実装である（`ErrVersionConflict`を直接
返す代わりに、現在versionを添えた`*VersionConflictError`を返す点のみが異なる。`errors.Is(err,
ErrVersionConflict)`は`Unwrap`経由で引き続き成立するため、4.1.3節の説明文自体は変わらない）。

```go
// internal/service/entry.go
func (s *entryService) Update(ctx context.Context, date, body string, expectedVersion int) (*model.Entry, error) {
	entry, err := s.repo.FindByDate(ctx, date)
	if err != nil {
		return nil, err
	}
	if entry == nil {
		return nil, ErrNotFound
	}

	entry.Body = body
	entry.UpdatedAt = time.Now()

	ok, err := s.repo.Update(ctx, entry, expectedVersion)
	if err != nil {
		return nil, err
	}
	if !ok {
		// 競合時点のサーバー側の最新版を読み直し、クライアントに返す。
		current, err := s.repo.FindByDate(ctx, date)
		if err != nil {
			return nil, err
		}
		currentVersion := expectedVersion // フォールバック（理論上ここでnilになることはない）
		if current != nil {
			currentVersion = current.Version
		}
		return nil, &VersionConflictError{CurrentVersion: currentVersion}
	}
	entry.Version = expectedVersion + 1
	return entry, nil
}
```

以下は4.1.4節で示した`EntryHandler.Update`を**置き換える**実装である。`current_version`を
レスポンスに含めるため、`errors.Is`ではなく`errors.As`で`*VersionConflictError`を取り出す点が異なる。

```go
// internal/handler/entry.go
func (h *EntryHandler) Update(w http.ResponseWriter, r *http.Request) {
	// ...リクエストのデコードは既存のまま...

	entry, err := h.entryService.Update(r.Context(), date, req.Body, req.Version)
	if err != nil {
		var vce *service.VersionConflictError
		switch {
		case errors.Is(err, service.ErrNotFound):
			respondError(w, http.StatusNotFound, "NOT_FOUND", err.Error())
		case errors.As(err, &vce):
			respondJSON(w, http.StatusConflict, map[string]interface{}{
				"error": map[string]interface{}{
					"code":            "VERSION_CONFLICT",
					"message":         vce.Error(),
					"current_version": vce.CurrentVersion,
				},
			})
		default:
			respondError(w, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
		}
		return
	}
	// ...既存の画像取得・レスポンス処理...
}
```

レスポンス例（4.1.4節の記載を`current_version`付きに更新）:

```jsonc
// HTTP 409 Conflict
{
  "error": {
    "code": "VERSION_CONFLICT",
    "message": "他の変更と競合しました。最新の内容を確認してください",
    "current_version": 5
  }
}
```

#### 4.2.4.2 フロントエンド: `ApiError`とAPIクライアントの拡張

`current_version`をアプリ側で扱えるよう、`ApiError`に運び先を追加する。

```ts
// frontend/src/api/client.ts
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly currentVersion?: number, // 追加：VERSION_CONFLICT時のサーバー側最新version
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  const json = await res.json()
  if (!res.ok || 'error' in json) {
    const code = json?.error?.code ?? 'UNKNOWN'
    const message = json?.error?.message ?? res.statusText
    const currentVersion = json?.error?.current_version
    throw new ApiError(code, message, res.status, currentVersion)
  }
  return json.data as T
}
```

#### 4.2.4.3 フロントエンド: `useAutoSave`への`reloadFromServer`/`forceSave`追加

4.2.2節で再設計した`useAutoSave`に、競合解消用の2関数を追加する。まず`runRound`の catch 節で
競合時点のサーバー側versionを保持しておく。

```ts
// frontend/src/hooks/useAutoSave.ts（4.2.2節の続き）
const conflictVersionRef = useRef<number | null>(null) // 競合発生時点のサーバー側version

// runRound 内の catch 節（4.2.2節）を以下のように拡張する
} catch (e) {
  if (e instanceof ApiError && e.code === 'VERSION_CONFLICT') {
    conflictVersionRef.current = e.currentVersion ?? null
    setStatus('conflict') // 自動保存タイマーはこの状態では発火させない
  } else {
    console.error('自動保存に失敗しました', e)
    setStatus('error')
  }
  settle(() => round.reject(e))
}
```

その上で、以下の2関数を追加する。いずれも既存の`requestSave`/`round`の仕組みをそのまま利用し、
新たな排他制御は導入しない（呼び出し時点で`activeRoundRef`は競合により既に`null`になっているため、
通常の`requestSave`呼び出しと同様に振る舞う）。

```ts
// 「最新の内容を読み込み直す」：サーバーの最新状態を取得し、内部の版管理をそれに同期する。
// フォームの表示内容そのものはこの関数の責務外で、戻り値を使って呼び出し元（EntryForm）が
// react-hook-form の値を書き換える。
const reloadFromServer = useCallback(async (): Promise<{ body: string; version: number }> => {
  const { date: currentDate } = valuesRef.current
  const entry = await entries.getByDate(currentDate)
  versionRef.current = entry.version
  lastSavedBodyRef.current = entry.body
  conflictVersionRef.current = null
  setStatus('idle')
  return { body: entry.body, version: entry.version }
}, [])

// 「このまま自分の内容で保存する」：サーバー側の最新versionを採用した上で、
// 現在の入力内容（valuesRef経由で常に最新）をそのまま強制的に再送する。
// 再送が再度409になった場合は catch 節が再度 conflictVersionRef を更新し、
// status も 'conflict' に戻るため、バナーは表示され続ける（無限ループにはならない。
// ボタンを押すたびに高々1回リクエストが飛ぶだけ）。
const forceSave = useCallback((): Promise<void> => {
  if (conflictVersionRef.current === null) {
    return Promise.reject(new Error('競合状態ではありません'))
  }
  versionRef.current = conflictVersionRef.current
  conflictVersionRef.current = null
  return requestSave()
}, [requestSave])
```

戻り値に追加する:

```ts
// frontend/src/hooks/useAutoSave.ts（戻り値、4.2.2節の記載を置き換え）
return {
  status,
  autoCreated,
  getCreatedDate: () => createdDateRef.current,
  getVersion: () => versionRef.current,
  save: requestSave,
  reloadFromServer, // 追加
  forceSave,        // 追加
}
```

#### 4.2.4.4 フロントエンド: `EntryForm`でのバナー表示

バナーは`EntryForm`内で完結させ、`NewEntryPage`/`EditEntryPage`側の変更は不要にする
（`useAutoSave`を保持しているのが`EntryForm`のため）。

```tsx
// frontend/src/components/features/EntryForm.tsx
const {
  register,
  handleSubmit,
  watch,
  setValue, // 追加：reloadFromServer後にbodyフィールドを書き換えるために使う
  formState: { errors, isSubmitting },
} = useForm<FormValues>({ ... })

const {
  status: autoSaveStatus,
  autoCreated,
  getCreatedDate,
  save,
  reloadFromServer,
  forceSave,
} = useAutoSave({ ... })

const handleReload = async () => {
  const { body } = await reloadFromServer()
  // shouldDirty: false … 「読み込み直した」内容を初期値として扱い、直後の自動保存対象から除外する
  setValue('body', body, { shouldDirty: false })
}

const handleForceSave = async () => {
  if (!window.confirm('サーバー上の他の変更を上書きして保存します。よろしいですか？')) return
  try {
    await forceSave()
  } catch {
    // 再度409だった場合は status が 'conflict' に戻り、バナーが表示され続ける。
    // ここでは何もしない（自動保存のエラー表示と同じくstatus経由でユーザーに伝わる）。
  }
}

// JSX（フォーム内、テキストエリアの下あたりに配置）
{autoSaveStatus === 'conflict' && (
  <div role="alert" className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
    <p>他のタブ/端末での変更を検知しました。このまま保存すると上書きされる可能性があります。</p>
    <div className="mt-2 flex gap-2">
      <Button type="button" variant="secondary" size="sm" onClick={handleReload}>
        最新の内容を読み込み直す
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={handleForceSave}>
        このまま自分の内容で保存する
      </Button>
    </div>
  </div>
)}
```

ポイント:

- 「最新の内容を読み込み直す」はサーバーの内容で入力を完全に置き換える破壊的操作だが、
  取り返しがつかないほどではない（誤操作してもサーバー側の内容は失われない）ため確認ダイアログなし。
  一方「このまま自分の内容で保存する」はサーバー側の他者の変更を消し得る操作のため、
  `window.confirm`で一段確認を挟む。
- `handleSubmit`（手動投稿）が呼ぶ`save()`は、競合解消前でも呼び出し自体は可能だが、
  `versionRef`が古いままなら再度409になるだけで害はない（`status`が`'conflict'`のまま変わらず、
  バナーも表示され続ける）。手動投稿時に競合解消を強制する必要はない。
- `reloadFromServer`が返す`version`は`setValue`では使わない（`useAutoSave`内部の`versionRef`に
  既に反映済みのため）。呼び出し元が別途保持する必要はない。

#### 4.2.5 リクエストのキャンセル（AbortController）

保存キューの直列化により「同一タブ内で2本のリクエストが同時に飛ぶ」ことは無くなるため、
競合バグの直接的な修正としては必須ではない。ただし以下の理由で `AbortController` の導入も合わせて行う。

- ページ遷移・コンポーネントアンマウント時に、飛び去ったリクエストの完了を待たずに次の画面へ
  遷移できるようにする（レスポンス待ちで `queryClient.invalidateQueries` 等がアンマウント後に
  呼ばれるのを防ぐ）。
- `fetchJson` に `signal?: AbortSignal` を受け付けられるようにし、`useAutoSave` はアンマウント時に
  in-flightリクエストをabortする。

```ts
// frontend/src/api/client.ts
export async function fetchJson<T>(
  url: string,
  options: RequestInit & { params?: ...; signal?: AbortSignal } = {},
): Promise<T> {
  // ...
  const res = await fetch(fullUrl, { headers: {...}, ...init })
  // signal は init 経由でそのまま fetch に渡る
}
```

## 5. 移行手順

サーバー・クライアントは同一リポジトリ・同一デプロイ単位のため、APIバージョニングは行わず
一括でリリースする。問題Aはフロントのみで完結し即効性が高いため最優先で対応し、問題Bはその後
段階的に進める。

1. **問題Aの修正**（3章）: `EntryFormHandle.isAutoCreated` の追加、`NewEntryPage`の判定変更、
   `useEntry`の`refetchOnWindowFocus`オプション化。単独でリリース可能で、既存のAPI・DBには影響しない
2. **DBスキーマ**: `version` カラム追加のマイグレーション（4.1.1節）
3. **Model/Repository/Service/Handler**: 楽観ロックの導入（4.1.2〜4.1.4節）。この時点でバックエンドの
   ユニットテスト・ハンドラーテストを追加し、既存のUpdate系テストは `expectedVersion` を渡す形に更新する
4. **フロントAPI層**: `entries.update` に `version` を必須化（4.2.3節）。バックエンドと同時にデプロイする
   必要があるため、フロント単体では動かない状態が一時的に生じる点に注意（同一PR内で完結させる）
5. **保存キューの統合**: `useAutoSave` の再設計（4.2.2節、`autoCreated`の維持・reject伝播を含む）、
   `EntryForm`への`autoSaveInitialVersion`propの追加と`EditEntryPage`からの受け渡し（4.2.2.1節）、
   `EntryFormHandle`の`awaitCurrentSave`→`save`への置き換えと`NewEntryPage`/`EditEntryPage`の
   呼び出し側の追従（4.2.2.2節）
6. **競合UI**: バナー・再読み込み導線の追加（4.2.4節）
7. **AbortControllerの導入**（4.2.5節、任意・後回し可）

## 6. テスト計画

### 問題Aの修正に対するテスト

- `NewEntryPage`のテスト: `autoCreated`が`true`になった後、`useEntry`の結果が（バックグラウンド再フェッチ等で）
  truthyに変わっても`navigate`が呼ばれないことを確認
- `NewEntryPage`のテスト: 自動保存とは無関係に、ページを開いた時点で既にサーバーに存在するエントリの場合は
  従来通り`/:date/edit`へ遷移することを確認（回帰防止）
- 手動確認: `/new`で入力 → 自動保存が発火するのを待つ（30秒） → ブラウザのタブを切り替えて戻る →
  画面が`/edit`へ遷移しない、または遷移しても直前の入力が失われていないことを確認

### 問題B（楽観ロック・保存キュー）に対するテスト

バックエンド:

- `internal/infra/sqlite/entry_test.go`: 期待バージョン一致時は更新されRowsAffected>0、
  不一致時は更新されずfalseが返ることを確認
- `internal/service/entry_test.go`: バージョン不一致時に `ErrVersionConflict`（`errors.Is`で判定可能な
  `*VersionConflictError`）を返すこと、その`CurrentVersion`にサーバー側の最新バージョンが入っていること、
  DB UNIQUE制約違反時に `ErrDuplicateDate` へマッピングされることを確認
- `internal/handler/entry_test.go`: `VERSION_CONFLICT` エラーが409で返ること、レスポンスJSONの
  `error.current_version` にサーバー側の最新バージョンが含まれることを確認
- 既存のUpdate関連テストは、`expectedVersion` 引数の追加に合わせてシグネチャを更新

フロントエンド:

- `useAutoSave.test.ts`:
  - 保存中に自動保存tickと手動`save()`呼び出しが重なった場合、実際のリクエストは1本のみで、
    完了後に最新内容で追いの保存が1回だけ走ること（coalescing）を検証
  - 409（`VERSION_CONFLICT`）を受けたら `status: 'conflict'` になり、以降のtickで保存しないこと
  - 通常の保存成功時に返された `version` が次回の更新リクエストに使われること
  - `save()`がAPIエラー（ネットワークエラー・409含む）で失敗した場合、返り値のPromiseがrejectされること
  - `initialVersion`を渡した場合、既存エントリに対する最初の`update`呼び出しがその値を`version`引数
    として使うこと
  - 進行中の保存Aが成功し、それに合流していた次ラウンドBの保存が失敗した場合、Aを呼び出した側の
    `save()`は成功のまま解決され、Bを呼び出した側の`save()`だけがrejectされること（別ラウンドの
    失敗が無関係な呼び出し元に伝播しないことの確認）
  - 本文が空、または前回保存から内容が変化していないためにスキップされたラウンドでも、
    それに合流していた呼び出し元の`save()`がハングせず解決されること
  - 新規エントリで自動保存による`create`が成功したら`autoCreated`が`true`になること（3章対策1の
    `isAutoCreated`が再設計後も機能し続けることの回帰テスト）
  - 保存が`saving`→`saved`と状態遷移する間、自動保存タイマーがリセットされず`intervalMs`ごとに
    一定間隔で発火し続けること（`status`変化のたびにタイマーが再起動されないことの確認）
  - `VERSION_CONFLICT`（`current_version`付き）を受けた際、`status`が`'conflict'`になることに加え、
    その`current_version`が内部で保持されること（`forceSave`の前提条件）
  - `reloadFromServer()`が`entries.getByDate`の結果で`version`・`lastSavedBody`を更新し、
    `status`を`'conflict'`から抜けさせ、`{ body, version }`を返すこと
  - `forceSave()`が保持していた`current_version`を使って`update`を呼び、成功したら`status`が
    `'saved'`になり競合状態を抜けること。競合状態でない（`current_version`を保持していない）ときに
    呼ばれた場合はrejectされること
  - `forceSave()`が再度409を受けた場合、新しい`current_version`で`status`が再び`'conflict'`に
    戻ること（無限ループにならず、呼び出し1回につきリクエストも1本のみであること）
- `NewEntryPage.test.tsx`/`EditEntryPage.test.tsx`: `save()`が失敗した`handleSubmit`が成功トースト・
  画面遷移を行わず、エラートーストを表示すること
- `EntryForm.test.tsx`: `autoSaveStatus`が`'conflict'`のときに競合バナーが表示されること、
  「最新の内容を読み込み直す」クリックで本文フィールドが`reloadFromServer`の返り値に置き換わること、
  「このまま自分の内容で保存する」クリックは確認ダイアログ経由で`forceSave`を呼ぶこと

手動確認:

- 同一エントリを2タブで開き、両方で編集 → 片方を保存 → もう片方を保存 → 409が発生し
  バナーが出ることを目視確認
- 低速回線エミュレーション（Chrome DevTools Network Throttling）下で、自動保存中に投稿ボタンを
  連打しても本文が欠落しないことを確認

## 7. スコープ外（将来検討）

- リアルタイム共同編集（WebSocket等によるフィールドレベルのマージ）
- サーバー側でのリビジョン履歴保持（誤って「最新を読み込み直す」を選んだ場合の復旧手段）
- 複数デバイス間のオフライン編集キュー・再接続時の自動マージ
