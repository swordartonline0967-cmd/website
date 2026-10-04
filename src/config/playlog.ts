/**
 * 発売日順クリア企画の設定
 * ここを書き換えて保存（Commit changes）すると、約10分でサイトに反映されます。
 * 使い方の説明書: docs/05-発売日順クリア企画.md
 */
export const playlog = {
  /** 企画の名前（ページの見出しなどに表示） */
  name: '発売日順クリア企画',

  /** メニューに表示する短い名前 */
  navLabel: 'クリア企画',

  /** 企画の紹介文（企画ページの最初に表示） */
  intro:
    '家庭用ゲーム機のソフトを、機種ごとに日本での発売日順に遊んでクリアしていく企画です。据置機も携帯機も対象で、プレイの様子はYouTubeで公開しています。',

  /** YouTubeチャンネルの名前とURL */
  youtubeName: 'ふところ',
  youtubeUrl: 'https://www.youtube.com/@ふところ-p5h',

  /**
   * 記録を書いた Google スプレッドシートを「ウェブに公開」したときの、CSV形式のURL。
   * 例: 'https://docs.google.com/spreadsheets/d/e/xxxxxxxx/pub?gid=0&single=true&output=csv'
   * 空欄（''）のあいだは、スプレッドシートからの自動取り込みは行いません。
   */
  sheetCsvUrl: '',

  /**
   * ダウンロード専用ソフトは企画の対象外です。ただし、ここに書いた機種だけは例外として対象にします。
   * 機種IDで書きます（例: 'switch2'）。機種IDはハードのページのURLの /platforms/ の後ろの部分です。
   */
  digitalOnlyPlatforms: ['switch2'],
};
