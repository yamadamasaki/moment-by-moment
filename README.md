# moment by moment

Cloudflare の無料枠で動かす、ごく小さなマイクロブログ。

- 本文は GitHub の public repo (`content/`) に JSON で置く
- push すると Workers Builds が `npm run build` で静的 HTML / RSS を作り、配信する
- `/admin` から書くと、GitHub API 経由で `content/posts/<blog>/` に commit される
- 読む人は各投稿の下の線をクリックして、ひとことを送れる。ひとことは絵文字ひとつに変換され、D1 に保存される

```
content/config.json                    サイト名・URL・blog の一覧
content/posts/<blog>/<UTC時刻>.json     1 投稿 1 ファイル
src/build/      静的生成 (content/ → dist/)
src/worker/     /admin, /auth/*, /api/reactions だけを処理する Worker (Hono)
src/lib/emoji*  ひとこと → 絵文字の変換と、そのキーワード索引 (npm run gen:emoji で再生成)
migrations/     D1 のスキーマ
src/views/      Hono JSX のテンプレート
public/         そのまま dist/ にコピーされる (style.css)
```

投稿ファイルの形式:

```json
{
  "datetime": "2026-11-18T13:55:30+09:00[Asia/Tokyo]",
  "body": "本文 (300 文字まで)",
  "tags": ["朝", "季節"]
}
```

## ローカルで見る

```sh
npm install
cp .dev.vars.example .dev.vars   # 見た目を確認するだけならダミー値で可
npm run db:migrate:local         # 初回だけ。ローカルの D1 にテーブルを作る
npm run dev                      # http://localhost:8787
```

blog を増やすには `content/config.json` の `blogs` に追加する (id は英小文字・数字・ハイフン)。

## デプロイ

1. GitHub に public repo を作り push する
2. GitHub で **OAuth App** を作る (Settings → Developer settings → OAuth Apps)
   - Authorization callback URL: `https://<your-worker>.workers.dev/auth/callback`
   - ローカルで書く画面も試すなら、`http://localhost:8787/auth/callback` 用にもう一つ作る
3. D1 を作り、表示された `database_id` を `wrangler.jsonc` に書く
   ```sh
   npx wrangler d1 create moment-by-moment
   ```
4. `wrangler.jsonc` の `vars` (`GITHUB_OWNER`, `GITHUB_REPO`, `ALLOWED_USER`) と `content/config.json` の `site.url` を埋める
5. secret を登録する
   ```sh
   npx wrangler secret put GITHUB_CLIENT_ID
   npx wrangler secret put GITHUB_CLIENT_SECRET
   npx wrangler secret put SESSION_SECRET   # openssl rand -base64 32 など
   ```
6. Cloudflare ダッシュボード → Workers → この Worker → Settings → Builds で repo を接続
   - Build command: `npm run build`
   - Deploy command: `npm run db:migrate:remote && npx wrangler deploy`

以後は `/admin` から書けば、push → 自動ビルド → 1 分ほどで反映される。

## 絵文字コメント

- 一人ひとつ: 読む人には長期の cookie (ランダム ID) を発行し、投稿ごとに 1 つだけ保存する。送り直すと置き換わり、先頭に移る
- cookie を消しても増やせないように、同じ IP からは 1 投稿あたり 3 人分まで。それを超えると、その IP の最新の 1 つを置き換える (家庭や職場で IP を共有していると、4 人目以降は誰かのものを上書きする)
- 同じ IP からの送信は 10 分に 30 回まで
- cookie の ID と IP は HMAC (鍵は `SESSION_SECRET`) にしてから保存し、生の値は残さない
- 表示は新しい順に 48 個まで。はみ出した分は右端でフェードアウトする
- 変換: 入力に絵文字が含まれていればそれを使う → よく使う言葉の手書き表 (`src/lib/emoji.ts` の `OVERRIDES`) → CLDR の日本語/英語キーワードと GitHub の shortcode (`:tada:`) → どれにも当たらなければ、文字列のハッシュで決まった穏やかな絵文字

## 開発

```sh
npm test           # vitest
npm run typecheck
```
