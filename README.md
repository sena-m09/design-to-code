# design-to-code

デザインデータを元にコードを実装し、デザインとの見た目の差分が閾値に収まるまで、最大 3 回 Claude Code に調整させる仕組み。比較した画素のうち差分のある画素の割合 `diffRatio` が `--threshold`（既定 0.02）以下になれば合格とする。

次のスキルとコマンドからなる。実装の規約・トークン・ビルドのコマンドは対象プロジェクトの規約（エージェントに読み込まれている指示、README、既存コード）と `package.json` から読むため、設定ファイルは持たない。

| 名前 | 役割 |
| --- | --- |
| `figma-to-code` スキル | Figma の URL から実装する |
| `image-to-code` スキル | デザインカンプの画像（PNG/JPG）から実装する |
| `figma-diff` コマンド（`scripts/figma-diff.mjs`） | デザインの画像と実装の描画結果を比べる |
| `design-image` コマンド（`scripts/design-image.mjs`） | デザインの画像の寸法・色・背景の切り替わりを測る |
| `harness-report` コマンド（`scripts/harness-report.mjs`） | スキルを動かした Claude Code のセッションを集計し、比べやすい報告にまとめる |

## プロジェクトへの導入

導入のしかたは 2 通りある。複数のプロジェクトで使うなら、コマンドとして導入するほうが更新を 1 か所で済ませられる。

### ファイルをコピーする

1. 次のファイルをプロジェクトにコピーする。

   | コピー元 | コピー先 |
   | --- | --- |
   | `scripts/figma-diff.mjs` | `scripts/figma-diff.mjs` |
   | `scripts/lib/` | `scripts/lib/` |
   | `.claude/skills/figma-to-code/` | `.claude/skills/figma-to-code/` |

2. 依存を入れ、Chromium を用意する。

   ```sh
   pnpm add -D playwright pixelmatch pngjs
   pnpm exec playwright install chromium
   ```

3. 差分チェックの出力先 `.figma-diff/` を `.gitignore` に足す。

4. Claude Code のサンドボックス内では Chromium が起動しないため、差分チェックのコマンドだけをサンドボックスから除外する。プロジェクトの `.claude/settings.local.json` に追記する。

   ```json
   {
     "sandbox": {
       "excludedCommands": ["node scripts/figma-diff.mjs *"]
     }
   }
   ```

5. Figma の MCP（`get_design_context` `get_screenshot` `get_variable_defs` `get_metadata` `download_assets`）を Claude Code に許可する。

### コマンドとして導入する

1. このリポジトリを手元に置き、依存と Chromium を入れる。

   ```sh
   pnpm install
   pnpm setup:browser
   ```

2. `figma-diff` と `design-image` を `PATH` の通った場所からリンクする。

   ```sh
   ln -s "$PWD/scripts/figma-diff.mjs" ~/.local/bin/figma-diff
   ln -s "$PWD/scripts/design-image.mjs" ~/.local/bin/design-image
   ```

3. スキルを `~/.claude/skills/` にリンクすると、すべてのプロジェクトから呼べる。

   ```sh
   ln -s "$PWD/.claude/skills/image-to-code" ~/.claude/skills/image-to-code
   ```

4. 使うプロジェクトごとに、`.figma-diff/` を git の管理から外し、`.claude/settings.local.json` のサンドボックス除外に `"figma-diff *"` を足す。

## 使い方

開発サーバーを起動した状態で、Claude Code に依頼する。

```text
/figma-to-code https://www.figma.com/design/<file>?node-id=1-2 を実装して
/image-to-code <カンプの PNG> を実装して。設計幅 375、@2x
```

### figma-diff

デザインの画像と、実装を描画した結果を比べる。

```sh
figma-diff --url <描画先の URL> --selector "<対象セレクタ>" --figma <デザインの PNG> --width <設計幅>
```

比較のたびに `.figma-diff/<selector>-<width>/` へ `figma.png` `actual.png` `diff.png` `compare.png` `summary.json` が上書きされる。終了コードは、合格が 0、差分ありまたは実行エラーが 1。

結果を読むときは `summary.json` を使う。標準出力の文面は変わることがあるが、`summary.json` は `version` を上げない限り項目を消したり意味を変えたりしない。

`--log <ファイル>` を付けると、実行ごとに日時・コミット・`diffRatio` を JSON Lines で 1 行ずつ足す。`--tag <名前>` を付けると、その名前も一緒に残る。調整の前後や試した変更ごとに差分率を並べたいときに使う。

### design-image

デザインの画像を測る。座標と寸法は CSS px で指定し、`--scale` に書き出しの倍率（@2x なら 2）を渡す。結果は JSON で出る。

```sh
design-image info  <PNG> --design-width 375                 # 寸法と倍率
design-image probe <PNG> --scale 2 --at 10,10 --at 20,400    # 指定した位置の色
design-image crop  <PNG> --scale 2 --rect 0,148,375,564 --out section.png
design-image bands <PNG> --scale 2                          # 1 色で塗られた行とそれ以外の並び
```

`bands` は、背景が 1 色で塗られた行（`solid`）と、要素が載った行（`mixed`）の並びを返す。セクションの境目や要素の間の余白を測るのに使う。`--axis x` と `--rect` を付けると、指定した範囲の中で列ごとに同じことをする。

### harness-report

スキルを動かした Claude Code のセッションのログを読み、Markdown の報告にまとめる。スキルを試したあと、どれだけ手間とトークンがかかったかを振り返るときに使う。

```sh
harness-report <worktree のパス> [--json]
```

worktree のパスを渡すと、`~/.claude/projects/` からその worktree の最新のログを選ぶ。別のログを使いたいときは、jsonl のパスを直接渡す。

報告には次の項目が並ぶ。

- 完了までにかかった時間。返答を待っていた時間は含めない。
- 最初の依頼のあとに受け取ったプロンプトとコマンド
- 消費したトークン。advisor の分も含める。
- 差分率の推移と最後の判定。worktree の `.figma-diff/runs.jsonl` から読む。
- スキルの手順書・`figma-diff`・`design-flow`・`design-image`・Figma MCP を使った時刻

パスを複数渡すと、セッションごとの列が並ぶ。このときは、あるセッションがほかの worktree のファイルを読んだ記録も載る。

## 開発

```sh
pnpm test
```

画像の計算（差分・切り出し・測定）は `scripts/lib/` に分けてあり、合成した画像で `node --test` から確かめられる。ブラウザでの撮影（`scripts/lib/capture.mjs`）はテストに含まれないので、変えたときは実際のページで `figma-diff` を走らせ、変更前と `summary.json` が一致するかを見る。
