// Native MathML keeps fractions, indices and powers readable without a CDN.
const symbol = value => `<mi>${value}</mi>`;
const number = value => `<mn>${value}</mn>`;
const op = value => `<mo>${value}</mo>`;
const row = value => `<mrow>${value}</mrow>`;
const fraction = (top, bottom) => `<mfrac>${row(top)}${row(bottom)}</mfrac>`;
const power = (base, exponent) => `<msup>${base}${number(exponent)}</msup>`;
const sub = (base, index) => `<msub>${symbol(base)}${index}</msub>`;
const upright = text => `<mi mathvariant="normal">${text}</mi>`;
const parentheses = value => row(`${op('(')}${value}${op(')')}`);
const space = '<mspace width="0.18em"/>';
const equals = op('='), plus = op('+'), minus = op('−');
const theta = symbol('θ'), g = symbol('g'), t = symbol('t'), h = symbol('h');
const d = symbol('d'), H = symbol('H'), m = symbol('m'), v = symbol('v');
const v0 = sub('v', number(0));
const half = fraction(number(1), number(2));
const sin = `${space}${upright('sin')}${space}${theta}`, cos = `${space}${upright('cos')}${space}${theta}`;
const tan = `${space}${upright('tan')}${space}${theta}`;
const ek = sub('E', upright('k')), ep = sub('E', upright('p'));

function equation(label, expression, note = '') {
  return `<div class="equation-row"><span class="equation-label">${label}</span><div class="equation-body"><math xmlns="http://www.w3.org/1998/Math/MathML" display="block">${row(expression)}</math>${note ? `<small>${note}</small>` : ''}</div></div>`;
}
const card = (title, content) => `<section class="formula-card"><h3>${title}</h3>${content}</section>`;

export function renderTheory(container) {
  container.innerHTML = `
    <p>공기 저항과 회전을 무시하고 공의 위치를 계산합니다. 공의 크기는 골대 통과 판정에 반영합니다.</p>
    ${card('01 · 위치와 속도', [
      equation('수평 위치', `${symbol('x')}${parentheses(t)}${equals}${v0}${cos}${space}${t}`),
      equation('높이', `${symbol('y')}${parentheses(t)}${equals}${h}${plus}${v0}${sin}${space}${t}${minus}${half}${g}${power(t, 2)}`),
      equation('수평 속도', `${sub('v', symbol('x'))}${equals}${v0}${cos}`),
      equation('수직 속도', `${sub('v', symbol('y'))}${equals}${v0}${sin}${minus}${g}${t}`),
    ].join(''))}
    <p class="symbol-guide"><b>기호 안내</b> v₀: 초기 속력 · θ: 발사 각도 · t: 시간 · h: 발사 높이 · g: 중력가속도 9.8 m/s²<br>X는 골대 방향, Y는 높이, Z는 좌우입니다. 길이는 m, 시간은 s를 사용합니다.</p>
    ${card('02 · 자동 슈팅 계산', [
      equation('필요한 초기 속력', `${v0}${equals}<msqrt>${fraction(`${g}${power(d, 2)}`, `${number(2)}${space}${power(upright('cos'), 2)}${space}${theta}${space}${parentheses(`${d}${tan}${plus}${h}${minus}${H}`)}`)}</msqrt>`),
      equation('최소 속력 각도', `${sub('θ', upright('opt'))}${equals}${fraction(symbol('π'), number(4))}${plus}${half}${space}${upright('arctan')}${parentheses(fraction(`${H}${minus}${h}`, d))}`, '이 식의 결과는 라디안(rad)입니다.'),
      equation('도 단위로 변환', `${sub('θ', upright('deg'))}${equals}${sub('θ', upright('rad'))}${op('×')}${fraction(number(180), symbol('π'))}`),
    ].join(''))}
    <p class="symbol-guide"><b>d</b>: 골대까지 수평거리 · <b>H</b>: 림 높이 3.05 m<br>속력 계산식의 분모가 0보다 커야 합니다. 입력과 화면에는 도(°) 단위를 사용하고, 내부 계산에서는 라디안으로 변환합니다.</p>
    <p>OPTIMIZE는 <b>필요한 초기 속력의 최소화</b>입니다. 실제 농구에서 득점 확률이 가장 높은 각도라는 뜻이 아닙니다. 자동 계산한 낮은 각도에서는 상승 중 골대 높이에 도달하여 실패할 수 있습니다.</p>
    ${card('03 · 에너지 보존', [
      equation('운동 에너지', `${ek}${equals}${half}${m}${power(v, 2)}`),
      equation('위치 에너지', `${ep}${equals}${m}${g}${symbol('y')}`),
      equation('전체 역학적 에너지', `${symbol('E')}${equals}${ek}${plus}${ep}${equals}<mtext>일정</mtext>`),
    ].join(''))}
    <p class="symbol-guide"><b>m</b>: 공의 질량 · <b>v</b>: 현재 속력 · <b>y</b>: 현재 높이 · 에너지 단위: J</p>
    <p>바닥을 위치 에너지의 기준으로 삼습니다. 비행 중 역학적 에너지는 일정하고, 공 중심이 높이 0.12 m에 도달하면 계산을 종료합니다. 충돌·바운스는 구현하지 않습니다.</p>
    <p><b>통과 판정:</b> 공 중심이 3.05 m를 하강하며 통과할 때 림 중심과 수평 오차가 <b>0.225 − 0.120 = 0.105 m</b> 이하이면 SUCCESS입니다. 이는 3차원 림 충돌을 단순화한 판정입니다.</p>`;
}
