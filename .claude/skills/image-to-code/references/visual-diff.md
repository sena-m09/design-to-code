# カンプとの差分の測り方

SKILL.md の Step 5 から読む。

プロジェクトルートで次を実行する。`cd` や `&&` を前に付けずに単独で実行する。サンドボックスの除外ルール（`figma-diff *`）に一致しない形で実行すると、Chromium が起動しない。

```sh
figma-diff --url <描画先の URL> --selector "<対象セレクタ>" --figma "<カンプの PNG>" --width <設計幅> --log .local/runs.jsonl --tag <記録用の名前>
```

- 引数名は Figma のままだが、`--figma` に渡すのはカンプの PNG になる。
- `--log` を付けると、実行ごとに `diffRatio` とコミットが `.local/runs.jsonl` に 1 行ずつ残る。`--tag` には、ユーザーから指定された名前（試している仮説など）を渡す。指定が無ければ `baseline` にする。
- 固定ヘッダーのようにカンプに無い要素が写り込む場合は、`--hide "<そのセレクタ>"` で隠す。

結果は出力先の `summary.json` から読む。`diffRatio` が差分の割合、`diffClustersCssPx` が差分の大きい範囲になる。

Phase 1 の検証では、差分を見て実装を調整することはしない。実装直後の `diffRatio` を記録するのが目的なので、`pass: false` でもそのまま Step 6 へ進む。
