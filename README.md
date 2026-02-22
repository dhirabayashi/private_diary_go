# 私の日記

> **このプロジェクトはコード・ドキュメントを含むすべての成果物が [Claude Code](https://claude.ai/claude-code)（Anthropic）によって自動生成されています。**

個人利用向けのシンプルな日記 Web サービスです。
**単一の実行バイナリを起動するだけで動作します。**

## ⚠️ 免責事項

本ソフトウェアは**セキュリティを考慮せず設計されています**。
認証・認可・入力サニタイズ・通信の暗号化といったセキュリティ対策は実装されていません。

- **信頼できるローカルネットワーク内での個人利用のみ**を想定しています
- インターネット等の不特定多数がアクセスできる環境への公開は**絶対に行わないでください**
- 本ソフトウェアの使用によって生じたいかなる損害・トラブルについても、作者は一切の責任を負いません

## 機能

- 日記の投稿・編集・削除（一日一記事）
- 複数画像のアップロード（JPEG / PNG / GIF / WebP）
- キーワード・日付範囲での全文検索
- テキストファイル（`yyyyMMdd.txt`）のインポート（単一・ZIP 一括）
- ZIP ファイルへのエクスポート（全件・期間指定）
- 本文中の URL を自動リンク化

## タイムゾーン

本アプリケーションは**日本標準時（JST / UTC+9）を前提**として設計されています。

- 「未来日の投稿禁止」などの日付判定は JST の日付で行います
- サーバーの `TZ` 環境変数に関わらず、アプリケーション内部で JST を使用するため、UTC 環境で動作させても正しく動作します
- データベースに保存されるタイムスタンプ（`created_at` / `updated_at`）は RFC3339 形式で記録されます（タイムゾーン情報を含む）

---

## 必要な環境

| ツール | バージョン |
|---|---|
| Go | 1.23 以上 |
| Node.js | 18 以上 |
| npm | 8 以上 |

> **注意**: SQLite は Pure Go 実装（`modernc.org/sqlite`）を使用しているため、**CGo 不要**です。

---

## ビルド手順

### 1. リポジトリの取得

```bash
git clone <repository-url>
cd private_diary_go
```

### 2. Go 依存パッケージの取得

```bash
go mod download
```

### 3. フロントエンドのビルド

```bash
cd frontend
npm install
npm run build
cd ..
```

### 4. Go バイナリのビルド

```bash
go build -o diary .
```

`diary`（macOS / Linux）または `diary.exe`（Windows）が生成されます。

#### Makefile を使う場合（手順 3・4 をまとめて実行）

```bash
make build
```

---

## 起動方法

```bash
./diary
```

起動後、ブラウザで **http://localhost:8080** を開いてください。

### 設定（環境変数）

| 環境変数 | デフォルト値 | 説明 |
|---|---|---|
| `DIARY_PORT` | `8080` | Listen ポート番号 |
| `DIARY_DB_PATH` | `./diary.db` | SQLite ファイルのパス |
| `DIARY_IMAGE_DIR` | `./data/images` | アップロード画像の保存先 |

```bash
# 例: ポートと DB パスを変更して起動
DIARY_PORT=9000 DIARY_DB_PATH=/var/diary/diary.db ./diary
```

起動時にデータベースのマイグレーションが自動実行されます。`diary.db` や `data/images/` ディレクトリが存在しない場合は自動的に作成されます。

---

## 開発時の起動

フロントエンドの開発サーバー（HMR 有効）とバックエンドを同時に起動します。

```bash
# ターミナル 1: バックエンド
go run .

# ターミナル 2: フロントエンド開発サーバー
cd frontend
npm run dev
```

フロントエンドは **http://localhost:5173** で起動し、API リクエストは `http://localhost:8080` へプロキシされます。

---

## テスト

```bash
# 全テスト実行
go test ./...

# カバレッジレポート（HTML）を生成
make test-cover
```

### テスト構成

| レイヤー | 手法 |
|---|---|
| Domain | テーブル駆動テスト（モック不要） |
| Repository | 実 SQLite インメモリ DB を使用 |
| Service | Repository をモック化 |
| Handler | `net/http/httptest` + Service をモック化 |

---

## ディレクトリ構成

```
private_diary/
├── main.go                  # エントリポイント・DI
├── go.mod / go.sum
├── Makefile
├── diary.db                 # SQLite DB（自動生成・.gitignore）
├── data/images/             # アップロード画像（自動生成・.gitignore）
├── docs/
│   ├── REQUIREMENTS.md      # 要件定義
│   └── IMPLEMENTATION.md    # 実装方針
├── internal/
│   ├── model/               # ドメイン構造体
│   ├── domain/              # 純粋なビジネスロジック（I/O なし）
│   ├── repository/          # Repository インターフェース定義
│   ├── service/             # ユースケース（orchestration）
│   ├── handler/             # HTTP ハンドラ・ルーティング
│   └── infra/
│       ├── db/              # SQLite 接続・マイグレーション
│       ├── sqlite/          # Repository の SQLite 実装
│       └── storage/         # ローカルファイルストレージ
└── frontend/
    ├── src/
    │   ├── api/             # API クライアント
    │   ├── hooks/           # TanStack Query フック
    │   ├── components/      # UI / Feature / Layout コンポーネント
    │   └── pages/           # ページコンポーネント
    ├── package.json
    └── vite.config.ts
```

## API エンドポイント

| メソッド | パス | 説明 |
|---|---|---|
| `GET` | `/api/entries` | 一覧取得（`page`, `page_size`, `q`, `from`, `to`） |
| `POST` | `/api/entries` | 新規投稿 |
| `GET` | `/api/entries/:date` | 特定日取得 |
| `PUT` | `/api/entries/:date` | 更新 |
| `DELETE` | `/api/entries/:date` | 削除 |
| `POST` | `/api/entries/:date/images` | 画像アップロード |
| `GET` | `/api/entries/:date/export` | 単一記事を `.txt` でダウンロード |
| `DELETE` | `/api/images/:id` | 画像削除 |
| `POST` | `/api/import` | `.txt` ファイルインポート（単一ファイル） |
| `POST` | `/api/import/zip` | ZIP 一括インポート |
| `GET` | `/api/export` | ZIP エクスポート（`from`, `to`） |

---

## 技術スタック

**バックエンド**

- Go 1.23
- [chi](https://github.com/go-chi/chi) — HTTP ルーター
- [modernc.org/sqlite](https://pkg.go.dev/modernc.org/sqlite) — Pure Go SQLite（CGo 不要）
- [google/uuid](https://github.com/google/uuid) — 画像ファイル名生成

**フロントエンド**

- React 18 + TypeScript
- Vite — ビルドツール
- Tailwind CSS — スタイリング
- TanStack Query — サーバー状態管理
- React Router v6 — SPA ルーティング
- React Hook Form + Zod — フォーム・バリデーション
