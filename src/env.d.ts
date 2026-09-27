/// <reference types="astro/client" />

// もしもアフィリエイト公式のリンクに付く属性（ブラウザの計測API用）を型として認識させる
declare namespace astroHTML.JSX {
  interface AnchorHTMLAttributes {
    attributionsrc?: boolean | string;
  }
}
