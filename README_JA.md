<div align="center">
  <img src="com.konon.vrc-deck.sdPlugin/imgs/plugin/vrc-deck-main.svg" width="160" alt="VRC Deck ロゴ">

  # VRC Deck

  OSCとVRChat APIを使用して、Stream DeckからVRChatを操作し、状態を確認できます。
</div>

<div align="center">
  <a href="README.md">English</a> | <a href="README_KO.md">한국어</a> | 日本語
</div>

> VRC Deckは非公式のコミュニティプロジェクトです。VRChat Inc.またはElgatoとの提携や、両社による承認を受けた製品ではありません。

## プレビュー

### Stream Deckアクション

<img src="docs/images/stream-deck-actions.png" width="100%" alt="Stream Deckに設定されたVRC Deckアクション">

### Expressionコントロール

<img src="docs/images/expression-settings.png" width="100%" alt="Stream Deckのプロパティインスペクターに表示されたExpressionパラメーター設定">

### 利用可能なアクション

<img src="docs/images/action-list.png" width="100%" alt="Stream DeckアプリのVRC Deckアクション一覧">

## 機能

| アクション | 説明 | VRC Login |
| --- | --- | :---: |
| Mic Toggle | マイクのオン／オフを切り替え、現在の状態をリアルタイムで同期します。 | 不要 |
| AFK Status | 現在のVRChat AFK状態を表示します。 | 不要 |
| Avatar Height Increase | ボタンを1回押すか長押しして、アバターの目線の高さを上げます。 | 不要 |
| Avatar Height Decrease | ボタンを1回押すか長押しして、アバターの目線の高さを下げます。 | 不要 |
| Avatar Height Set | 目線の高さを指定した値に直接設定します。 | 不要 |
| Expression Toggle | アバターのBool Expressionパラメーターを切り替えます。 | 不要 |
| Expression Button | Bool、Int、FloatのExpressionパラメーターを指定した値に設定します。 | 不要 |
| Expression Cycle | Int Expressionパラメーターを指定した範囲内で順番に切り替えます。 | 不要 |
| Expression Increase / Decrease | 長押しによる連続入力を含め、数値Expressionパラメーターを増減します。 | 不要 |
| Auto Chat | 保存したメッセージをVRChatのチャットボックスへ直接送信します。 | 不要 |
| Panic Button | VRChatのセーフモードを有効にします。 | 不要 |
| VRC Login | VRChat APIを使用するアクションのためにログインします。 | — |
| Instance Status | 現在の人数またはワールド名を表示し、必要に応じてワールドのサムネイルを使用できます。 | 必要 |
| Avatar Change | 利用可能なアバターを検索し、選択したアバターへ変更します。 | 必要 |
| Current Avatar | 現在使用中のアバター名とサムネイルを表示します。 | 必要 |
| Online Status | VRChatのオンラインステータスを順番に切り替える、2つの状態間で切り替える、または指定した状態に設定します。 | 必要 |

## 動作要件

- Windows 10以降
- Stream Deck 7.1以降
- PC版VRChat
- OSCベースのアクションを使用する場合はVRChat OSCを有効化
- VRChat APIアクションを使用する場合はインターネット接続とVRC Login

現在、Stream Deck +のダイヤル操作には対応していません。

## インストール

1. [GitHub Releases](https://github.com/KONON-S2/vrc-deck/releases/latest)から最新の`.streamDeckPlugin`ファイルをダウンロードします。
2. ダウンロードしたファイルを開きます。
3. Stream Deckアプリでインストールを承認します。
4. アクション一覧から**VRC Deck**を探し、使用するアクションを追加します。

## VRChatでOSCを有効にする

1. VRChatを起動します。
2. Action Menuを開きます。
3. **Options → OSC**へ移動します。
4. OSCを有効にします。

VRC DeckはOSCQueryを通じてVRChatを自動検出し、VRChatの標準OSC入出力インターフェースを使用します。

## VRC Login

アバターの選択、現在のアバター情報、インスタンス情報、オンラインステータスの操作など、一部のアクションではVRChatアカウントデータへのアクセスが必要です。

1. **VRC Login**アクションをStream Deckのキーに追加します。
2. プロパティインスペクターにVRChatのユーザー名またはメールアドレスとパスワードを入力します。
3. 要求された場合は二要素認証を完了します。
4. ログインに成功した後は、パスワード入力欄を消去できます。

プラグインは入力されたパスワードを保持しません。Stream Deckの再起動後もセッションを復元できるよう、暗号化されたVRChatセッションをStream Deckのグローバル設定へローカル保存します。セッションデータはVRChat APIにのみ送信されます。

## Expressionパラメーター

Expressionアクションは、現在使用中のアバターのパラメーターを読み込みます。検索可能な一覧からパラメーターを選択し、その型に合わせてアクションを設定してください。

- Boolパラメーターは切り替えるか、`true`または`false`に設定できます。
- Intパラメーターは値の設定、循環、増加、減少ができます。
- 一般的なアバターExpression操作では、Floatパラメーターに`0.00`から`1.00`までの値を使用します。

パラメーター一覧が空の場合は、OSCが有効になっていることを確認し、アバターを再読み込みするか一度変更してください。

## アバターの高さ

アバターの高さに関するアクションは、VRChatの`/avatar/eyeheight` OSCエンドポイントを使用します。プラグインは起動後にOSCQueryから現在の高さを取得し、その後の変更も受信します。

- 増加時の初期最大値：`5.0 m`
- 減少時の初期最小値：`0.2 m`
- 設定可能な範囲：`0.1–100 m`

ワールド側でアバターのスケーリングが制限または無効化される場合があります。その場合、VRChatが要求した高さを無視したり、別の値を適用したりすることがあります。

## 重要事項

- **Panic Buttonはセーフモードを有効にするだけです。** 無効化するにはVRChatのQuick Menuを使用してください。
- VRChatは現在のセーフモード状態をOSCで公開していないため、VRC Deckではセーフモードが有効かどうかを表示できません。
- インスタンスとアバターのサムネイルは必要に応じてダウンロードされ、プラグインのメモリにキャッシュされます。VRC Deckが個別の画像ファイルとして保存することはありません。
- VRChatセッションの有効期限が切れると、APIアクションが動作しなくなる場合があります。VRC Loginを再度使用してアクセスを復元してください。

## サポート

問題は[GitHubリポジトリ](https://github.com/KONON-S2/vrc-deck)から報告してください。

フィードバックやその他の連絡方法については、[KONONのリンク集](https://guns.lol/konon_s2)をご覧ください。

問題を報告する際は、該当するアクション、Stream Deckのバージョン、VRChatのモード（DesktopまたはVR）、再現手順を記載してください。パスワード、セッションデータ、その他の個人情報は含めないでください。

## プロジェクトを支援する

VRC Deckを気に入っていただき、開発を支援したい場合は、[Buy Me a Coffee](https://buymeacoffee.com/konon)をご利用ください。

## ライセンス

Copyright (C) 2026 KONON. VRC Deckは、[GNU General Public License v3.0 only](LICENSE)（`GPL-3.0-only`）でライセンスされた自由ソフトウェアです。VRC Deckまたはその変更版を配布する場合は、対応するソースコードを同じライセンスで提供することを含め、GPLの条件に従う必要があります。

Lucideアイコンおよびその他の第三者素材には、それぞれのライセンスが適用されます。VRChatの名称、ロゴ、商標に関する権利はVRChat Inc.に帰属します。詳細については、リポジトリに含まれる通知ファイルをご確認ください。
