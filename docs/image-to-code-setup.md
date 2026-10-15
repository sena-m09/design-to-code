# image-to-code を試す

デザインカンプの画像（PNG）を渡すと、Claude Code がプロジェクトに実装し、画像と見比べながら最大 3 回まで調整します。この文書は、手元で試すための導入手順です。

## 必要なもの

- Node.js 20 以上と pnpm
- git
- Claude Code
- 実装先のプロジェクト。git で管理されていて、開発サーバーで画面を表示できること
- カンプの PNG と、その設計幅（スマートフォン向けなら 375 など）

## 1. design-to-code を手元に置く

```sh
git clone https://github.com/sena-m09/design-to-code.git
cd design-to-code
git switch feat/sena-m09-flow-engine
pnpm install
pnpm setup:browser
```

`pnpm setup:browser` は、画面を撮るための Chromium を入れます。

## 2. コマンドとスキルをリンクする

`figma-diff`・`design-image`・`design-flow` の 3 つのコマンドと、`image-to-code` スキルをリンクします。design-to-code のディレクトリで実行してください。

```sh
mkdir -p ~/.local/bin ~/.claude/skills
ln -s "$PWD/scripts/figma-diff.mjs" ~/.local/bin/figma-diff
ln -s "$PWD/scripts/design-image.mjs" ~/.local/bin/design-image
ln -s "$PWD/scripts/design-flow.mjs" ~/.local/bin/design-flow
ln -s "$PWD/.claude/skills/image-to-code" ~/.claude/skills/image-to-code
```

`~/.local/bin` に `PATH` が通っているかを確かめます。何も表示されなければ通っていないので、シェルの設定ファイルに `export PATH="$HOME/.local/bin:$PATH"` を足して開き直してください。

```sh
which design-flow
```

## 3. 実装先のプロジェクトを準備する

実装先のプロジェクトのルートで、次の 2 つを行います。

### `.figma-diff/` を git の管理から外す

比較の画像や進み具合の記録は `.figma-diff/` に書き出されます。ここを外し忘れると、ファイルが変わったかどうかの判定が狂い、調整を戻す手順から先に進めなくなります。必ず外してください。

チームの `.gitignore` を変えたくなければ、自分の手元だけで外せます。

```sh
echo ".figma-diff/" >> .git/info/exclude
git check-ignore .figma-diff/x && echo OK
```

`OK` が表示されれば外れています。

### サンドボックスの除外を足す（サンドボックスを使っている場合だけ）

Claude Code のサンドボックスの中では、画面を撮る Chromium が起動しません。プロジェクトの `.claude/settings.local.json` に、撮影するコマンドだけを除外する設定を足します。

```json
{
  "sandbox": {
    "excludedCommands": ["figma-diff *", "design-flow measure"]
  }
}
```

すでに `excludedCommands` がある場合は、その配列に 2 つを足してください。

### フォントを確かめる

カンプで使っているフォントが、プロジェクトで読み込まれているかを確かめてください。読み込まれていないと、文字の幅がずれて差分が大きく出ます。

## 4. 実装させる

開発サーバーを起動してから、プロジェクトで Claude Code を開いて依頼します。

```text
/image-to-code <カンプの PNG のパス> を実装して。設計幅 375
```

カンプが JPG なら、先に PNG に変換してください。macOS なら `sips -s format png カンプ.jpg --out カンプ.png` で変換できます。

Claude は、`design-flow` が示す手順に沿って進みます。

1. 画像を読み取る
2. 実装する
3. lint・型チェックを通す
4. 画像と見比べて調整する
5. 自己レビューをする
6. 報告する

進み具合は、別のターミナルから `design-flow status` で見られます。

## 結果の見かた

| 場所 | 中身 |
| --- | --- |
| `.figma-diff/flow/attempt-<回数>/compare.png` | カンプ・実装・差分を並べた画像。0 が実装直後 |
| `.figma-diff/flow/attempt-<回数>/summary.json` | 差分の割合（`diffRatio`）と、差分の大きい範囲 |
| `.figma-diff/flow/reading.md` | Claude が画像から読み取った内容 |
| `.figma-diff/runs.jsonl` | 測るたびの差分の割合の記録 |

## 知っておいてほしいこと

- **打ち切りになることが多いです**: 合格の基準は「差分のある画素が 2% 以下」で、Figma から実装する場合に合わせた厳しい値です。画像からの実装では、3 回調整しても届かずに打ち切りになることが多いと見込んでいます。打ち切り自体は想定内です。
- **写真やイラストは再現しません**: 同じ大きさの置き換え用の要素で場所だけ取ります。
- **初期表示の状態だけが対象です**: hover などの状態は扱いません。
- **戻す手順で止まることがあります**: 「調整を戻した」という報告が拒否されたとき、いまはどのファイルが違うのかまでは表示しません。調整のときに増やしたファイルが残っていないかを見てください。

## 試したあとに教えてほしいこと

- 実装直後と最後の `diffRatio`（`design-flow status` に出ます）と、最後の `compare.png`
- 見た目で大きく違ったところ
- 途中で止まった場所と、そのとき出たメッセージ
- 導入でつまずいたところ

## 片づける

リンクを消せば元に戻ります。

```sh
rm ~/.local/bin/figma-diff ~/.local/bin/design-image ~/.local/bin/design-flow ~/.claude/skills/image-to-code
```

実装先のプロジェクトでは、`.figma-diff/` を消し、足した除外の設定を戻してください。
