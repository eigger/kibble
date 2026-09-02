// 카카오 지도 SDK는 공식 다크 스킨을 제공하지 않아서, invert+hue-rotate 조합으로 다크모드를
// 흉내낸다. 이 조합은 채도가 있는 색의 색상(hue)은 대체로 유지하면서 밝기만 뒤집기 때문에
// (흰 배경→검정, 어두운 마커색→밝은 마커색) 마커 색을 따로 보정하지 않아도 어울린다.
export const DARK_MAP_FILTER = "invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9)";
