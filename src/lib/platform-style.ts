import type { Platform } from './types';

const GROUP_CLASS: Record<string, string> = {
  任天堂: 'mg-nintendo',
  ソニー: 'mg-sony',
  セガ: 'mg-sega',
  NEC: 'mg-nec',
  SNK: 'mg-snk',
  バンダイ: 'mg-bandai',
  マイクロソフト: 'mg-ms',
};

/** 機種バッジ用のCSSクラス（メーカー系列ごとの色） */
export function platformClass(p: Platform | undefined): string {
  return (p && GROUP_CLASS[p.makerGroup]) || 'mg-other';
}

export const PLATFORM_TYPE_LABEL: Record<string, string> = {
  home: '据え置き型',
  handheld: '携帯型',
  hybrid: '据え置き・携帯両用',
  addon: '周辺機器（拡張）',
};
