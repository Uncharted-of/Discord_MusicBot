# Discord VC 音楽Bot

Discord のボイスチャンネル（VC）で音楽を流す Bot です。
Bot を VC に入れておくと **その VC のテキストチャットを常時監視** し、

- チャットに **mp3（など音声ファイル）を添付** → そのまま VC で再生
- チャットに **YouTube のリンクを貼る** → 自動で VC で再生
- キューが続く限り順番に再生し、終わったら待機（監視は継続）

`m!p <URL>` のような「URL + コマンド」を毎回打つ必要はありません。

## 特徴

- **コマンド不要の再生**: VC のテキストチャットに貼るだけ
- **コスト0で運用**: YouTube Data API / Spotify などの課金・クォータ系 API は不使用。ローカルの `yt-dlp` と `ffmpeg` だけで完結
- **低CPU**: 音声は ffmpeg で Ogg/Opus に変換してパススルー送出（ネイティブ opus エンコーダ不要）
- **オートプレイなし**: キューが尽きたら待機します（関連動画の自動補充は行いません）

## 必要環境

| ツール | 確認コマンド |
| --- | --- |
| Node.js 22 以上 | `node -v` |
| ffmpeg | `ffmpeg -version` |
| yt-dlp | `yt-dlp --version` |

macOS の場合:

```bash
brew install ffmpeg yt-dlp
```

> `yt-dlp` は更新が頻繁です。YouTube 側の変更で動かなくなったら `brew upgrade yt-dlp`（または `pip install -U yt-dlp`）を試してください。

## Bot の作成（初回のみ）

1. [Discord Developer Portal](https://discord.com/developers/applications) で **New Application** → Bot を作成
2. **Bot** タブで **Token** を取得（`Reset Token`）
3. **Privileged Gateway Intents** で **MESSAGE CONTENT INTENT** を **ON**
   - これを有効にしないと、メッセージ本文・添付ファイルを取得できません
4. **OAuth2 → URL Generator** で招待 URL を作成
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: `View Channels`, `Send Messages`, `Embed Links`, `Read Message History`, `Add Reactions`, `Connect`, `Speak`
5. その URL からサーバーへ招待

## セットアップ

```bash
npm install
cp .env.example .env
# .env を編集して DISCORD_TOKEN と GUILD_ID を設定
```

`.env` の最低限の設定:

```dotenv
DISCORD_TOKEN=あなたのBotトークン
GUILD_ID=サーバーID
```

`GUILD_ID` を指定するとスラッシュコマンドがそのサーバーに即時登録されます（未指定だとグローバル登録になり反映まで時間がかかります）。

## 起動

### Docker（推奨・常駐向け）

`ffmpeg` / `yt-dlp` はイメージ内に入っているので、ホスト側のインストールは不要です。

```bash
docker compose up -d --build   # ビルドしてバックグラウンド起動
docker compose logs -f         # ログを追う
docker compose stop            # 停止
docker compose down            # コンテナ削除
```

- `restart: unless-stopped` により、Docker Desktop が動いている間は自動復帰します
- リソースは `mem_limit: 768m` / `cpus: 1.0` / `cpu_shares: 512` に制限済み（Opus パススルーなので実使用は僅少）
- 音源の一時ファイルは named volume `bot-tmp`（`/data/tmp`）に置き、起動時に自動掃除します
- yt-dlp を更新したいときは `docker compose build --no-cache && docker compose up -d`

### ローカルで直接実行（開発向け）

```bash
npm run dev     # 開発（ファイル変更で自動再起動）
npm run build   # ビルド
npm start       # ビルド済みを実行
```

起動時に `ffmpeg` / `yt-dlp` の存在確認とバージョン表示を行います。`DISCORD_TOKEN` が無い場合はその場でエラー終了します。

## Discord と連動して自動起動/停止（macOS）

Discord アプリを開いたら Bot が起動し、Discord を終了したら Bot が停止するようにできます。
LaunchAgent が **15 秒ごとに `Discord` プロセスを確認**するだけなので、常駐アプリの追加インストールは不要です。

```bash
./scripts/install-watch.sh     # インストール（ログイン時から有効）
./scripts/uninstall-watch.sh   # 解除
```

| Discord | Bot コンテナ | 動作 |
| --- | --- | --- |
| 起動中 | 停止 | Docker を（必要なら）起動して Bot を起動 |
| 起動中 | 起動中 | 何もしない |
| 終了 | 起動中 | Bot を停止 → 他のコンテナが無ければ Docker Desktop も終了 |
| 終了 | 停止 | 何もしない |

調整用の環境変数（`install-watch.sh` 実行時に指定）:

| 変数 | 既定 | 説明 |
| --- | --- | --- |
| `INTERVAL` | `15` | 監視間隔（秒） |
| `QUIT_DOCKER_DESKTOP` | `1` | Discord 終了時に Docker Desktop も終了する（他コンテナが動いていれば終了しない） |
| `DISCORD_PROCESS` | `Discord` | 監視するプロセス名（Canary は `Discord Canary` など） |

```bash
QUIT_DOCKER_DESKTOP=0 INTERVAL=30 ./scripts/install-watch.sh   # 設定を変えて再インストール
```

- ログ: `~/Library/Logs/discord-vc-music-bot/watch.log`（動作ログ）/ `compose.log`（docker compose の最新出力）
- `.env` が無い／`DISCORD_TOKEN` が空のときは起動せず、稼働中のコンテナも停止します（再起動ループ防止）
- Discord 起動直後は Docker Desktop の準備待ちで数十秒かかることがあります

## 使い方

1. 自分が VC に入る
2. `/join` を実行（Bot が同じ VC に参加し、その VC のチャット監視を開始）
3. **VC のテキストチャット**に次のどちらかを投稿
   - mp3 / m4a / wav / ogg / opus / flac / webm / mp4 の添付ファイル
   - YouTube の URL（`youtube.com/watch?v=...`, `youtu.be/...`, `youtube.com/shorts/...`, `music.youtube.com/...`）
4. 自動でキューに追加され、再生が始まります（追加成功時は ✅ リアクションが付きます）

> 再生できるのは **その VC に参加している人**（または `DJ_ROLE_ID` のロール / 管理者）だけです。
> VC に入らずにチャットへ書き込んでも再生されません。

プレイリスト URL（`youtube.com/playlist?list=...`）を貼ると、上限件数までまとめてキューに積みます。

### コマンド

| コマンド | 説明 |
| --- | --- |
| `/join` | 実行者の VC に参加し、そのチャットの監視を開始 |
| `/leave` | 停止して VC から退出（監視も終了） |
| `/play [query] [file]` | URL・検索語・添付ファイルでキューに追加（未接続なら自動参加） |
| `/skip` | 再生中の曲をスキップ |
| `/pause` / `/resume` | 一時停止 / 再開 |
| `/stop` | 再生停止 + キュー全消去（VC には残る＝監視継続） |
| `/queue` | 再生待ちの一覧 |
| `/nowplaying` | 再生中の曲 |
| `/volume <0-200>` | 音量変更（即時反映） |

`/skip` `/pause` `/resume` `/stop` `/volume` は **接続中の VC にいる人・DJ ロール・管理者** のみ実行できます（`/queue` `/nowplaying` は誰でも参照可）。
`/join` `/leave` は `DJ_ROLE_ID` を設定した場合のみ DJ ロールが必要になります。

## 環境変数

| 変数 | 必須 | 既定 | 説明 |
| --- | --- | --- | --- |
| `DISCORD_TOKEN` | ✅ | — | Bot トークン |
| `GUILD_ID` | 推奨 | — | 単一サーバーの ID。指定するとコマンド登録が即時反映 |
| `YTDLP_PATH` | | `yt-dlp` | yt-dlp の実行パス |
| `FFMPEG_PATH` | | `ffmpeg` | ffmpeg の実行パス |
| `YTDLP_COOKIES_FILE` | | — | Netscape 形式の cookie ファイル（bot 判定対策） |
| `DJ_ROLE_ID` | | — | 再生操作を許可するロール ID（未設定でも「接続中 VC 在席 or 管理者」で許可） |
| `DEFAULT_VOLUME` | | `80` | 初期音量（%） |
| `MAX_QUEUE` | | `50` | キューの上限件数 |
| `MAX_ATTACHMENT_MB` | | `200` | 添付ダウンロードの上限（MB）。超過時は即中断 |
| `IDLE_TIMEOUT_MS` | | `0` | 無音時に自動退出するまでのミリ秒。`0` で無効 |
| `TEMP_DIR` | | OS の一時領域 | ダウンロード先 |
| `DEBUG` | | `0` | `1` でデバッグログ（ffmpeg / yt-dlp の出力など） |

## 仕組み

```
VC のテキストチャットに投稿
        │
        ├ mp3 添付  → Discord CDN から一時ファイルへ保存
        └ YouTube   → yt-dlp で音声のみ取得（一時ファイル）
        ↓
ffmpeg: -i <file> -c:a libopus -f ogg pipe:1  （音量は -af volume で適用）
        ↓
@discordjs/voice: StreamType.OggOpus でパススルー送出
        ↓
VC で再生（終了したら一時ファイルを削除して次の曲へ）
```

### ディレクトリ構成

```
Dockerfile / docker-compose.yml / scripts/   # コンテナ実行と Discord 連動
src/
├── index.ts                     # 起動・イベント配線
├── config.ts / logger.ts
├── music/
│   ├── GuildMusicManager.ts     # 接続・キュー・再生ループ
│   ├── MusicService.ts          # ギルドごとの manager と通知
│   ├── resolve.ts               # 添付 / URL の解決
│   ├── ytdlp.ts                 # yt-dlp 呼び出し
│   ├── ffmpeg.ts                # Ogg/Opus ストリーム生成
│   └── Track.ts
├── handlers/
│   ├── voiceChatWatcher.ts      # VC テキストチャット監視
│   └── commands/                # スラッシュコマンド
└── util/                        # 一時ファイル・ツール確認
```

## トラブルシューティング

| 症状 | 対処 |
| --- | --- |
| チャットに貼っても反応しない | `MESSAGE CONTENT INTENT` が ON か確認。Bot が `/join` で入っている VC のチャットか確認（監視対象は接続中の VC のみ） |
| `⚠ YouTube の情報を取得できませんでした: ... Sign in to confirm you're not a bot` | `YTDLP_COOKIES_FILE` にブラウザの cookie を書き出したファイルを指定。`yt-dlp` を最新化 |
| `VC に接続できませんでした` | Bot に `Connect` / `Speak` 権限があるか、VC のユーザー上限に達していないか確認 |
| 音が出ない | `/volume` を確認。VC 内で Bot がミュート / サーバーミュートされていないか確認 |
| ライブ配信が再生されない | 仕様です（ライブ配信は対象外） |
| 曲が途中で切れる | `DEBUG=1` でログを確認。ディスク容量・ネットワークを確認 |
| 起動時に `Cannot start Docker Compose application ... 500 Internal Server Error` | Docker Desktop の起動直後はエンジンが未準備のため一時的に発生します。スクリプトは最大 3 回リトライし、次回ポーリング（15 秒後）でも再試行するので通常は自動復帰します。繰り返す場合は Docker Desktop → Settings → General の **「Docker Desktop 起動時に Docker Compose アプリケーションを起動する」を OFF** にしてください（起動は LaunchAgent が担当するため不要） |

## セキュリティ

外部由来の文字列（YouTube のタイトル、添付ファイル名、ユーザー名、エラー文）は Discord へ出す前に無害化しています。

- すべてのメッセージ送信で `allowedMentions: { parse: [] }` を指定 → **メンション爆撃を防止**
- タイトル等の `[` `]` `` ` `` をエスケープ → **`[公式サイト](https://evil)` のような偽リンクを無効化**
- `yt-dlp` の stderr は **ログにのみ出力**し、Discord には分類済みの定型文だけを返す → **ホストの絶対パス・cookie パスを非公開**
- 添付ダウンロードは `Content-Length` 事前チェック + ストリーミング中のバイト計数で **上限超過時に即中断**
- 外部プロセス（`yt-dlp` / `ffmpeg`）は **argv 配列 + `shell` なし**で起動し、ユーザー入力は URL 検証済みの最終位置引数にのみ渡す → **コマンドインジェクション不可**
- 添付保存先は `path.extname()` のみを使い UUID ディレクトリ内に固定 → **パストラバーサル不可**
- ファイル取得は Discord CDN の署名付き URL のみ → **SSRF 不可**

## 注意事項

- YouTube からの音源取得は各サービスの利用規約に関わります。私的利用の範囲でご利用ください。
- Bot は単一サーバーでの利用を想定しています（内部的にはギルド単位で管理しているため、複数サーバーでも動作します）。
- 一時ファイルは再生後に削除され、起動時にも前回の残骸を掃除します。
