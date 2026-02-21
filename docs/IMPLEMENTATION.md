# 実装方針

## バックエンド

### アーキテクチャ概観

レイヤードアーキテクチャを採用する。各レイヤーは明確な責務を持ち、依存は必ず上位から下位へ一方向のみとする。

```
┌─────────────────────────────┐
│        Handler Layer        │  ← HTTPリクエスト/レスポンス
├─────────────────────────────┤
│        Service Layer        │  ← 処理の orchestration（I/Oを伴う）
├─────────────────────────────┤
│        Domain Layer         │  ← 純粋なビジネスロジック（I/O なし）
├─────────────────────────────┤
│      Repository Layer       │  ← データアクセス抽象
├─────────────────────────────┤
│   Infrastructure Layer      │  ← SQLite・ファイルI/O 実装
└─────────────────────────────┘

共有: Model（ドメイン構造体） ── 全レイヤーから参照される
```

---

### 各レイヤーの責務

#### Model（ドメインモデル）

- `Entry`・`Image` などのドメイン構造体を定義する
- ビジネスロジックを**持たない**純粋なデータ構造
- 他のいかなるレイヤーにも依存しない
- 全レイヤーから参照される共有パッケージとして位置づける

```
internal/model/
├── entry.go    // Entry, ListParams, SearchParams 等
└── image.go    // Image
```

#### Domain Layer

- **I/Oを一切持たない純粋な関数・ロジック**のみを置く
- 引数を受け取り、結果を返すだけ。副作用なし（DBアクセスなし・ファイルI/Oなし）
- Modelにのみ依存する。他のいかなるレイヤーにも依存しない
- このレイヤーのテストにモックは不要。入力と出力だけを検証すればよい

このプロジェクトにおける具体的な配置例:

```
internal/domain/
├── date.go       // 日付バリデーション（未来日チェック、フォーマット検証）
├── filename.go   // インポートファイル名のパース（"20240315.txt" → "2024-03-15"）
├── url.go        // 本文中のURL検出（表示時のリンク化に使う範囲情報を返す）
└── preview.go    // 本文の冒頭プレビュー文字列の生成
```

**ServiceはDomainを呼び出し、その結果をもとにRepositoryを操作する。**

```go
// internal/domain/date.go
// ParseEntryDate は "2024-03-15" 形式の文字列を検証し、
// 未来日であればエラーを返す純粋関数。
func ParseEntryDate(s string, now time.Time) (time.Time, error) {
    t, err := time.Parse("2006-01-02", s)
    if err != nil {
        return time.Time{}, ErrInvalidDateFormat
    }
    if t.After(now.Truncate(24 * time.Hour)) {
        return time.Time{}, ErrFutureDate
    }
    return t, nil
}

// internal/domain/filename.go
// ParseImportFilename は "20240315.txt" からエントリ日付文字列 "2024-03-15" を返す純粋関数。
func ParseImportFilename(name string) (string, error) {
    base := strings.TrimSuffix(name, ".txt")
    t, err := time.Parse("20060102", base)
    if err != nil {
        return "", ErrInvalidFilename
    }
    return t.Format("2006-01-02"), nil
}
```

#### Handler Layer

- HTTPリクエストの受け取りとレスポンスの返却のみを担う
- リクエストボディのパース・バリデーション・JSONシリアライズを行う
- **ビジネスロジックを持たない**。すべての処理はServiceに委譲する
- Serviceのインターフェースに依存し、具体的なService実装には依存しない

```
internal/handler/
├── entry.go    // 日記CRUD
├── image.go    // 画像アップロード・削除
├── import.go   // txtファイルインポート
├── export.go   // ZIPエクスポート
└── router.go   // ルーティング定義
```

#### Service Layer

- I/Oを伴う処理の**orchestration**を担う
- Domainの純粋ロジックを呼び出し、その結果をもとにRepositoryを操作する
- Repositoryのインターフェースに依存し、具体的なRepository実装には依存しない
- 複数のRepositoryをまたぐトランザクション管理もこのレイヤーで行う
- **ビジネスルールそのものはDomainに書き、ServiceはそれをDomainに委ねる**

```
internal/service/
├── entry.go    // 投稿・編集・削除・一覧・検索
├── image.go    // 画像の追加・削除・並び替え
├── import.go   // txtパース・エントリ登録
└── export.go   // ZIPアーカイブ生成
```

#### Repository Layer

- データの永続化・取得のインターフェースを定義し、その実装を提供する
- インターフェースはServiceが定義（またはservice/portパッケージ）し、実装はinfraに置く
- SQLの詳細・ファイルI/Oの詳細はこのレイヤーに閉じ込める

```
internal/repository/
├── entry.go           // EntryRepository インターフェース定義
└── image.go           // ImageRepository インターフェース定義

internal/infra/
├── sqlite/
│   ├── entry.go       // EntryRepository の SQLite 実装
│   └── image.go       // ImageRepository の SQLite 実装
└── storage/
    └── local.go       // ファイルストレージの実装
```

#### Infrastructure Layer

- DBコネクション管理・マイグレーション実行
- ローカルファイルストレージへの画像保存・削除
- 外部との境界（SQLite、OS ファイルシステム）を抽象化する

---

### 依存関係の規則

```
Handler  →  (ServiceInterface)  →  Service
                                      │
                              ┌───────┴────────┐
                              ↓                ↓
                            Domain    (RepositoryInterface)
                         （純粋関数）          ↓
                                         Repository/Infra

Model    ←  (参照のみ) すべてのレイヤー
Domain   ←  (参照のみ) Service・テスト
```

- **上位レイヤーは下位レイヤーのインターフェースにのみ依存する**
- 具体的な実装への依存は `main.go` でのDI（依存性注入）でのみ解決する
- インターフェースを介することで、テスト時にモックへ差し替えられる
- **DomainはI/Oを一切持たないため、どこからでも直接呼び出せる。モックは不要**

#### 依存性注入（main.go）

```go
// main.go でのみ具体的な実装を組み合わせる
db := infra.NewSQLite(cfg.DBPath)
storage := infra.NewLocalStorage(cfg.ImageDir)

entryRepo := sqlite.NewEntryRepository(db)
imageRepo := sqlite.NewImageRepository(db)

entryService := service.NewEntryService(entryRepo)
imageService := service.NewImageService(imageRepo, storage)
importService := service.NewImportService(entryRepo)
exportService := service.NewExportService(entryRepo, imageRepo, storage)

r := handler.NewRouter(entryService, imageService, importService, exportService)
```

---

### インターフェース定義例

```go
// internal/repository/entry.go
type EntryRepository interface {
    FindByDate(ctx context.Context, date string) (*model.Entry, error)
    List(ctx context.Context, params model.ListParams) ([]*model.Entry, int, error)
    Save(ctx context.Context, entry *model.Entry) error
    Delete(ctx context.Context, date string) error
    ExistsDate(ctx context.Context, date string) (bool, error)
}
```

---

### テスト戦略

各レイヤーの特性に合わせたテスト手法を採用する。

| レイヤー | テスト手法 | モック |
|---|---|---|
| Domain | 入力/出力のみ検証（テーブル駆動） | **不要** |
| Handler | `httptest` + Serviceモック | Service |
| Service | Domainを実呼び出し・Repositoryをモック | Repository のみ |
| Repository | 実SQLite（インメモリ） | **不要** |

#### Model

- テスト対象: なし（ロジックを持たないため）

#### Domain（単体テスト）

- **モック不要**。純粋関数なので入力と期待する出力のペアだけでテストできる
- テーブル駆動テスト（`table-driven tests`）が最も適している
- 網羅性を高めやすく、境界値・異常系も自然に書ける

```go
// internal/domain/date_test.go
func TestParseEntryDate(t *testing.T) {
    now := time.Date(2024, 3, 15, 12, 0, 0, 0, time.UTC)
    tests := []struct {
        name    string
        input   string
        wantErr error
    }{
        {"正常: 当日",    "2024-03-15", nil},
        {"正常: 過去日",  "2024-01-01", nil},
        {"異常: 未来日",  "2024-03-16", ErrFutureDate},
        {"異常: 不正形式", "20240315",  ErrInvalidDateFormat},
        {"異常: 空文字",   "",          ErrInvalidDateFormat},
    }
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            _, err := ParseEntryDate(tt.input, now)
            assert.ErrorIs(t, err, tt.wantErr)
        })
    }
}

// internal/domain/filename_test.go
func TestParseImportFilename(t *testing.T) {
    tests := []struct {
        input   string
        want    string
        wantErr bool
    }{
        {"20240315.txt", "2024-03-15", false},
        {"20241231.txt", "2024-12-31", false},
        {"invalid.txt",  "",          true},
        {"2024031.txt",  "",          true},  // 桁数不足
        {"20241301.txt", "",          true},  // 13月
    }
    for _, tt := range tests {
        t.Run(tt.input, func(t *testing.T) {
            got, err := ParseImportFilename(tt.input)
            if tt.wantErr {
                assert.Error(t, err)
            } else {
                assert.Equal(t, tt.want, got)
            }
        })
    }
}
```

#### Handler（単体テスト）

- `net/http/httptest` パッケージを使い、HTTPリクエスト/レスポンスレベルでテストする
- Serviceはモック（インターフェース実装）に差し替える
- 検証観点:
  - 正常系: レスポンスのHTTPステータスコード・JSONボディ
  - 異常系: 不正なリクエスト（バリデーションエラー）・Serviceエラー時のレスポンス
- ライブラリ: 標準 `testing` + `net/http/httptest`、モック生成は `github.com/stretchr/testify/mock` または手動モック

```go
func TestEntryHandler_GetByDate(t *testing.T) {
    mockService := &MockEntryService{}
    mockService.On("GetByDate", "2024-03-15").Return(&model.Entry{...}, nil)

    h := handler.NewEntryHandler(mockService)
    req := httptest.NewRequest(http.MethodGet, "/api/entries/2024-03-15", nil)
    rec := httptest.NewRecorder()
    h.GetByDate(rec, req)

    assert.Equal(t, http.StatusOK, rec.Code)
}
```

#### Service（単体テスト）

- **Repositoryのみ**モックに差し替える
- Domainの純粋関数はモックにせず実際に呼び出す（差し替える理由がない）
- 検証観点は「I/Oを伴うフロー」の正しさに絞る:
  - Repositoryの呼び出し順序・引数が正しいか
  - Repositoryがエラーを返した場合に適切に伝播するか
  - 複数Repositoryをまたぐ操作が正しく orchestrate されるか
- **「未来日はエラー」「ファイル名パースが正しい」といった純粋なロジックはDomainテストで担保済みであり、Serviceテストでは重複して書かない**

```go
// Service のテストでは「Repositoryが正しく呼ばれるか」を検証する
func TestEntryService_Create_SavesEntry(t *testing.T) {
    mockRepo := &MockEntryRepository{}
    mockRepo.On("ExistsDate", mock.Anything, "2024-03-15").Return(false, nil)
    mockRepo.On("Save", mock.Anything, mock.MatchedBy(func(e *model.Entry) bool {
        return e.Date == "2024-03-15" && e.Body == "本文"
    })).Return(nil)

    svc := service.NewEntryService(mockRepo)
    err := svc.Create(ctx, "2024-03-15", "本文")

    assert.NoError(t, err)
    mockRepo.AssertExpectations(t)
}

// 重複日付はRepositoryの返値に応じた分岐を検証する
func TestEntryService_Create_DuplicateDateError(t *testing.T) {
    mockRepo := &MockEntryRepository{}
    mockRepo.On("ExistsDate", mock.Anything, "2024-03-15").Return(true, nil)

    svc := service.NewEntryService(mockRepo)
    err := svc.Create(ctx, "2024-03-15", "本文")

    assert.ErrorIs(t, err, service.ErrDuplicateDate)
    mockRepo.AssertNotCalled(t, "Save")  // Saveが呼ばれていないことも確認
}
```

#### Repository（統合テスト）

- 実際のSQLite（インメモリ or 一時ファイル）を使いDBとの結合を検証する
- モックは使わず、実際のSQLクエリが正しく動くことを確認する
- テストごとにDBを初期化（テスト終了後に破棄）
- 検証観点:
  - CRUD操作が正しく機能するか
  - UNIQUE制約（entry_date）が機能するか
  - 検索クエリが期待通りの結果を返すか

```go
func TestEntryRepository_Save_DuplicateDate(t *testing.T) {
    db := infra.NewInMemorySQLite(t)  // テスト用ヘルパー
    repo := sqlite.NewEntryRepository(db)

    _ = repo.Save(ctx, &model.Entry{Date: "2024-03-15", Body: "初回"})
    err := repo.Save(ctx, &model.Entry{Date: "2024-03-15", Body: "重複"})
    assert.Error(t, err)
}
```

#### テストの実行

```bash
go test ./...                    # 全テスト
go test ./internal/handler/...   # Handlerのみ
go test ./internal/service/...   # Serviceのみ
go test ./internal/infra/...     # Repositoryのみ
```

---

### その他のバックエンド実装方針

#### エラーハンドリング

- Serviceはドメインエラー（`ErrFutureDate`、`ErrDuplicateDate`、`ErrNotFound` 等）を型として定義する
- Handlerはエラー型に応じてHTTPステータスコードへマッピングする（例: `ErrNotFound` → 404）
- エラーはラップして伝播させ、`errors.Is` / `errors.As` で判定する

```go
// internal/service/errors.go
var (
    ErrFutureDate    = errors.New("未来日には投稿できません")
    ErrDuplicateDate = errors.New("その日付にはすでに日記が存在します")
    ErrNotFound      = errors.New("日記が見つかりません")
)
```

**エラーを無視しない（`_ =` 禁止）**

プロダクションコードでエラーを `_` で捨てることを禁止する。すべてのエラーは次のいずれかで処理する。

| 状況 | 対処 |
|---|---|
| 通常のエラー | 呼び出し元に `return err` で伝播させる |
| ロールバック中に別のエラーが発生した場合 | `fmt.Errorf("%w; cleanup: %v", originalErr, cleanupErr)` でラップして返す |
| HTTPレスポンスのヘッダー送信後（`w.Write` / `json.Encode` 等） | クライアントへの返却が不可能なため `slog.Error` でログに記録する |

```go
// NG: エラーを捨てる
_ = s.storage.Delete(filename)
_, _ = w.Write(data)

// OK: 伝播させる
if err := s.storage.Delete(filename); err != nil {
    return err
}

// OK: ロールバック中の複合エラー
if err := s.repo.Save(ctx, img); err != nil {
    if delErr := s.storage.Delete(filename); delErr != nil {
        return fmt.Errorf("%w; storage cleanup: %v", err, delErr)
    }
    return err
}

// OK: ヘッダー送信後はログのみ
if _, err := w.Write(buf); err != nil {
    slog.Error("failed to write response", "error", err)
}
```

#### ロギング

- Go 1.21以降の標準ライブラリ `log/slog` を使用する（外部依存なし）
- 構造化ログ（JSON形式）で出力する
- HandlerでリクエストID・処理時間などをミドルウェアで付与する

#### API レスポンス形式

成功・失敗で統一したJSONフォーマットを使用する。

```jsonc
// 成功
{ "data": { ... } }

// 失敗
{ "error": { "code": "FUTURE_DATE", "message": "未来日には投稿できません" } }
```

#### データベースマイグレーション

- `golang-migrate` ライブラリを使用する
- マイグレーションファイル（`.sql`）はバイナリに `embed` する
- アプリ起動時に自動的にマイグレーションを実行する

```
internal/infra/db/migrations/
├── 000001_create_entries.up.sql
├── 000001_create_entries.down.sql
├── 000002_create_images.up.sql
└── 000002_create_images.down.sql
```

#### 設定管理

- 設定は環境変数で受け取り、起動時に構造体へバインドする（外部ライブラリ不要）
- デフォルト値を設けて、設定なしでもすぐ起動できるようにする

| 環境変数 | デフォルト | 説明 |
|---|---|---|
| `DIARY_PORT` | `8080` | listenポート |
| `DIARY_DB_PATH` | `./diary.db` | SQLiteファイルパス |
| `DIARY_IMAGE_DIR` | `./data/images` | 画像保存ディレクトリ |

#### ビルド・開発フロー（Makefile）

```makefile
.PHONY: dev build test

dev:            ## フロントエンド開発サーバ + バックエンド同時起動
    ...

build:          ## フロントエンドビルド → Goバイナリ生成
    cd frontend && npm run build
    go build -o diary .

test:           ## バックエンドテスト全件実行
    go test ./...

test-cover:     ## カバレッジ付きテスト
    go test ./... -coverprofile=coverage.out
    go tool cover -html=coverage.out
```

---

## フロントエンド

### コンポーネント設計

**Atomic Designを参考にした3層構造**を採用する。

```
src/
├── components/
│   ├── ui/          # 再利用可能な汎用コンポーネント（Button, Input, Card 等）
│   ├── features/    # 機能単位のコンポーネント（EntryCard, ImageUploader 等）
│   └── layout/      # レイアウト（Header, PageLayout 等）
├── pages/           # ページコンポーネント（ルートと1対1に対応）
├── hooks/           # カスタムフック
├── api/             # APIクライアント
├── types/           # TypeScript型定義
└── utils/           # ユーティリティ関数
```

### 状態管理

- **サーバー状態**（APIデータ）: `TanStack Query (React Query)` を使用する
  - キャッシュ・ローディング・エラー状態を自動管理
  - 投稿・更新後のキャッシュ無効化（invalidation）で一覧を自動更新
- **クライアント状態**（フォーム等）: `useState` / `useReducer` で十分。グローバル状態管理ライブラリは導入しない

```ts
// hooks/useEntries.ts
export const useEntries = (params: ListParams) =>
  useQuery({
    queryKey: ['entries', params],
    queryFn: () => api.entries.list(params),
  });

export const useCreateEntry = () =>
  useMutation({
    mutationFn: api.entries.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['entries'] }),
  });
```

### APIクライアント

- 型安全なAPIクライアントを `api/` ディレクトリに集約する
- バックエンドのAPIレスポンス型と共通のTypeScript型を `types/` で定義する
- `fetch` APIをラップしたシンプルな実装とする（axios等は不要）

```ts
// api/entries.ts
export const entries = {
  list: (params: ListParams): Promise<{ data: EntryListResponse }> =>
    fetchJson('/api/entries', { params }),
  getByDate: (date: string): Promise<{ data: Entry }> =>
    fetchJson(`/api/entries/${date}`),
  create: (body: CreateEntryRequest): Promise<{ data: Entry }> =>
    fetchJson('/api/entries', { method: 'POST', body }),
};
```

### フォーム

- `React Hook Form` を採用する
- バリデーションは `zod` でスキーマ定義し、React Hook Form と統合する

```ts
const schema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  body: z.string().min(1, '本文を入力してください'),
});
```

### ルーティング

- `React Router v6` を採用する（SPA）
- ページコンポーネントとルートを1対1に対応させる

```ts
// App.tsx
const router = createBrowserRouter([
  { path: '/',             element: <TopPage /> },
  { path: '/new',          element: <NewEntryPage /> },
  { path: '/:date',        element: <EntryDetailPage /> },
  { path: '/:date/edit',   element: <EditEntryPage /> },
  { path: '/search',       element: <SearchPage /> },
  { path: '/import',       element: <ImportPage /> },
  { path: '/export',       element: <ExportPage /> },
]);
```

### テスト

- **ユニット/コンポーネントテスト**: `Vitest` + `React Testing Library`
  - ユーザ操作を起点としたテスト（`userEvent`）
  - APIはモックサーバ（`msw`）でスタブ化する
- **対象**: 複雑なロジックを持つカスタムフック・ユーティリティ関数・重要なコンポーネント

```ts
// hooks/useEntries.test.ts
test('日記一覧を取得できる', async () => {
  server.use(
    http.get('/api/entries', () => HttpResponse.json({ data: mockEntries }))
  );
  const { result } = renderHook(() => useEntries({}), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data).toHaveLength(2);
});
```

### その他のフロントエンド実装方針

#### 型安全性

- `strict: true` を tsconfig で有効にする
- `any` の使用を原則禁止とする
- バックエンドのAPIレスポンス型は `types/api.ts` に集約し、単一の真実の源とする

#### URL自動リンク化

- サードパーティライブラリ（`linkifyjs` 等）を使わず、シンプルな正規表現でURL検出・変換する
- XSS対策として必ず `textContent` で本文を扱い、リンク部分のみ `<a>` 要素として差し込む

#### 画像アップロード

- ドラッグ&ドロップと通常のファイル選択の両方に対応する
- アップロード前にクライアント側でファイル形式・サイズを検証する
- アップロード中はプログレス表示（またはスピナー）を表示する

#### エラーハンドリング

- APIエラーはTanStack Queryの `onError` / `isError` で一元管理する
- ユーザへの通知はトースト通知（軽量なライブラリ or 自前実装）で表示する
- ページレベルのエラーは React Router の `errorElement` で捕捉する

---

## ディレクトリ構成（最終版）

```
private_diary/
├── main.go
├── go.mod
├── go.sum
├── Makefile
├── docs/
│   ├── REQUIREMENTS.md
│   └── IMPLEMENTATION.md
├── internal/
│   ├── model/
│   │   ├── entry.go
│   │   └── image.go
│   ├── domain/
│   │   ├── date.go         # 日付バリデーション（未来日チェック等）
│   │   ├── filename.go     # インポートファイル名のパース
│   │   ├── url.go          # 本文中のURL検出
│   │   └── preview.go      # 本文プレビュー文字列生成
│   ├── repository/
│   │   ├── entry.go        # EntryRepository インターフェース
│   │   └── image.go        # ImageRepository インターフェース
│   ├── service/
│   │   ├── errors.go       # ドメインエラー定義
│   │   ├── entry.go
│   │   ├── image.go
│   │   ├── import.go
│   │   └── export.go
│   ├── handler/
│   │   ├── router.go
│   │   ├── entry.go
│   │   ├── image.go
│   │   ├── import.go
│   │   └── export.go
│   └── infra/
│       ├── db/
│       │   ├── sqlite.go
│       │   └── migrations/
│       │       ├── 000001_create_entries.up.sql
│       │       ├── 000001_create_entries.down.sql
│       │       ├── 000002_create_images.up.sql
│       │       └── 000002_create_images.down.sql
│       ├── sqlite/
│       │   ├── entry.go    # EntryRepository の SQLite 実装
│       │   └── image.go    # ImageRepository の SQLite 実装
│       └── storage/
│           └── local.go    # ファイルストレージ実装
├── data/                   # .gitignore 対象
│   └── images/
├── diary.db                # .gitignore 対象
└── frontend/
    ├── package.json
    ├── vite.config.ts
    ├── tsconfig.json
    └── src/
        ├── main.tsx
        ├── App.tsx
        ├── types/
        │   └── api.ts
        ├── api/
        │   ├── client.ts
        │   └── entries.ts
        ├── hooks/
        │   ├── useEntries.ts
        │   └── useEntry.ts
        ├── components/
        │   ├── ui/
        │   ├── features/
        │   └── layout/
        └── pages/
            ├── TopPage.tsx
            ├── NewEntryPage.tsx
            ├── EntryDetailPage.tsx
            ├── EditEntryPage.tsx
            ├── SearchPage.tsx
            ├── ImportPage.tsx
            └── ExportPage.tsx
```
