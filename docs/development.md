# 開発ガイド

## 手元で起動する

`web/index.html` をブラウザーで開きます。ビルドや外部パッケージのインストールは不要です。ローカルサーバーでも動作します。

HTML・CSS・JavaScriptだけで構成され、サーバー処理や外部通信はありません。

## テスト

Node.jsの標準テストランナーを使用します。

```sh
npm test
node --check web/app.js
node --check web/geometry.js
node --check web/render.mjs
```

座標計算・形状の初期値・分割クリップ・合体・線設定・保存データの検証をテストしています。UIを変更した場合は、ブラウザーでPC幅・スマートフォン幅、取り消し、保存復元、PNG/SVG書き出しも確認してください。

## ファイル構成

| ファイル                 | 役割                            |
| ------------------------ | ------------------------------- |
| `web/index.html`         | 画面とダイアログ                |
| `web/style.css`          | 表示・レスポンシブレイアウト    |
| `web/app.js`             | 操作・履歴・保存・書き出し      |
| `web/geometry.js`        | 図形・描画・データ検証          |
| `web/render.mjs`         | AI向けレシピからSVG・JSONを生成 |
| `tests/geometry.test.js` | 計算とデータ形式のテスト        |
| `tests/render.test.js`   | 生成コマンドと入力検証のテスト  |
| `package.json`           | バージョンとテストコマンド      |

## 保存データ

編集データはバージョン付きJSONで、読み込み上限は1MBです。形式や数値の範囲は `validateDocument` で検証します。全体設定・レイヤー設定は必須項目として検証します。新しい項目を加える場合は、生成・読み込み・往復保存を合わせて更新してください。

自動保存には `localStorage` を使います。保存キーは `magic-circle-editor-v1` です。旧定規の読み込み時は、指定範囲をサンプリングして自由曲線に変換します。それ以外の形式変換・設定値の推測や補完は行いません。直接ファイルを開いた場合とHTTPで開いた場合では、保存領域が異なることがあります。


## AIアシスタントと画像を作る

利用者からこのツールでの制作を依頼された場合の手順です。Node.jsとInkscapeを使います。

1. [geometry.js](https://raw.githubusercontent.com/S-Remi/Magic-circle-editor/main/web/geometry.js)と[render.mjs](https://raw.githubusercontent.com/S-Remi/Magic-circle-editor/main/web/render.mjs)を同じフォルダに保存します。clone・追加パッケージは不要です。直接取得できない場合はブラウザー等を試します。
2. 図形指定を `recipe.json` に保存します。初期値の補完・検証・保存はスクリプトが行います。

```json
[
  { "type": "circle", "rx": 320 },
  { "type": "crescent", "y": -220, "rx": 30, "divisions": 8 },
  { "type": "star", "rx": 100 }
]
```

3. 同じフォルダでSVG・編集用JSONを生成し、InkscapeでPNGに変換します。

```sh
node render.mjs recipe.json
inkscape magic-circle.svg --export-type=png --export-area-page --export-filename=magic-circle.png
```

既定は2048px・白背景・黒線1.5。透明背景は配列を `{"transparent":true,"layers":[...]}` で包みます。同じ形式で `size`・`globalColor`・`globalWidth`・`backgroundColor` も指定できます。
レイヤー末尾が手前。`color`・`width` は個別の線設定、`hideOverlap` は手前による隠蔽、`mergeOverlap` は同レイヤーの重なりで、`false`（隠さない）・`true`（合体）・`"clockwise"`（時計回りに上へ）・`"counterclockwise"`（反時計回りに上へ）を指定します。方向指定では指定方向へ順に上へ重ねます。3分割以上では各点を覆う図形の連続した並びを循環順序で調べ、その末尾を手前にします。全図形が重なる部分は共通領域、複数の並びがある場合はその点の角度に応じて手前を決めます。開始位置だけを特別扱いしません。各輪郭を交点で分割し、両側の最前面の図形が異なる境界を描きます。元の線のマスクだけでは失われる三重交差の接続部分も描画し、線の途切れを防ぎます。2分割では相互に隠れないよう通常の順序を保ちます。自由曲線は `type: "freehand"` と `curves` を指定します。`curves` は正規化した始点1個と、各3次ベジェ区間の制御点2個・終点1個を順に並べた座標ペア配列です。`rx`・`ry` で拡縮し、通常の位置・回転・分割設定を適用します。旧レシピ互換のため `line`・`curve` の入力と定規描画処理は維持しています。図形・数値範囲は `geometry.js` の `TYPES`・`RULER_TYPES`・`LIMITS` を参照します。

4. PNGの描画・重なり・背景を確認し、会話内にプレビュー表示してPNG・SVG・編集用JSONを渡します。実行できない工程は明示し、PNG化できない場合はSVG・JSONとエディターでの書き出し手順を渡します。画像生成モデルによる描き直しで代替しません。

自由曲線の近似は外部依存なしの最小二乗法で3次ベジェ曲線を求め、描画時は等弧長の点列をガウス平滑化（標準偏差10、短い線は縮小）してから、誤差が2.5を超える点で区間を分割します。「もっとなめらかにする」は既存曲線を再サンプリングし、標準偏差14で平滑化します。端点と位置・回転・分割設定を維持します。旧定規の変換には平滑化を適用しません。隣接区間は接線方向を共有します。描画中の入力点は最大1024点に間引き、制御点列は3073点まで検証します。自由曲線は閉じた面として合体・隠蔽しません。

テキストは `type: "text"` と `text` を指定します。`textLayout` は `"arc"`（既定）か `"straight"`、`fontFamily` は `"serif"`・`"sans-serif"`・`"monospace"`、`fontSize` は4〜120、`letterSpacing` は0〜40です。`rx` が円弧の半径または直線の配置幅の半分になります。文字はSVGの `textPath` で中央揃えにし、XML特殊文字をエスケープします。文字専用項目はテキストレイヤーだけで必須とし、既存の保存データには追加しません。フォントは埋め込まず端末の汎用書体を使用します。文字の合体は無効、上位レイヤーへの隠蔽は文字の塗りをマスクに使用します。
