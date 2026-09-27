// 생체신호 연계 지점. 앱의 나머지 부분은 getNightVitals 하나만 부른다.
// 지금은 seed.js가 만든 모의 데이터(data.vitals)를 돌려준다.
//
// 나중에 실제 기기와 연결하는 방법 (지금은 만들지 않음):
//  (가) 기기가 아래 형식의 JSON/CSV를 파일로 내보내면 관리자 화면에서 불러오기
//  (나) Web Bluetooth로 직접 받기 — 표준 Heart Rate 서비스(0x180D), Pulse Oximeter 서비스(0x1822). 크롬만 가능.
//  (다) 기기가 Wi-Fi로 서버에 올리고 앱은 그 서버에서 가져오기
// 어느 방식이든 원자료(초 단위 심박·SpO2)를 아래 하룻밤 요약으로 줄이는 계산은 이 파일 안에서 한다.
//
// 해석 원칙: PPG 기반 SpO2는 의료기기급이 아니므로 절대값보다 개인 내 변화로 본다.
// sqi < 설정값이거나 wearHours < 4인 밤은 '무효 측정일'로 판정에 쓰지 않는다 (metrics.js isValidNight).

import { getData } from './store.js';

// 대상자 한 명의 하룻밤 요약. 없으면 null.
// → { hrRest, spo2Min, spo2Below90Min, wearHours, sqi, steps }
export function getNightVitals(personId, date) {
  const v = getData().vitals.find(x => x.personId === personId && x.date === date);
  if (!v) return null;
  const { hrRest, spo2Min, spo2Below90Min, wearHours, sqi, steps } = v;
  return { hrRest, spo2Min, spo2Below90Min, wearHours, sqi, steps };
}
