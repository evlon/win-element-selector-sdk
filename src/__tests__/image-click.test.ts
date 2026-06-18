import { computeImageClickPoint } from '../image-click';
import type { FindImageMatch, ClickArea } from '../types';

const MATCH: FindImageMatch = { x: 200, y: 100, width: 80, height: 40, confidence: 0.99 };

describe('computeImageClickPoint', () => {
    test('no area returns center', () => {
        expect(computeImageClickPoint(MATCH)).toEqual({ x: 200, y: 100 });
    });

    test('equal inset on all sides stays at center', () => {
        const area: ClickArea = { left: '20%', right: '20%', top: '20%', bottom: '20%' };
        expect(computeImageClickPoint(MATCH, area)).toEqual({ x: 200, y: 100 });
    });

    test('asymmetric inset shifts center', () => {
        // template 80px wide: left=0, right=50% → clickable x=[160,200], center=180
        const area: ClickArea = { right: '50%' };
        expect(computeImageClickPoint(MATCH, area)).toEqual({ x: 180, y: 100 });
    });

    test('numeric 0.3 equals "30%"', () => {
        const r1 = computeImageClickPoint(MATCH, { left: 0.3 });
        const r2 = computeImageClickPoint(MATCH, { left: '30%' });
        expect(r1).toEqual(r2);
    });

    test('equal px outset stays at center', () => {
        const area: ClickArea = { left: '-10px', right: '-10px' };
        expect(computeImageClickPoint(MATCH, area)).toEqual({ x: 200, y: 100 });
    });

    test('asymmetric px shifts', () => {
        // template 80px wide, center 200: left=160, left+(-10)=150, right=240
        // clickable x=[150,240], center = 195
        const area: ClickArea = { left: '-10px' };
        expect(computeImageClickPoint(MATCH, area)).toEqual({ x: 195, y: 100 });
    });

    test('top/bottom inset', () => {
        // template 40px tall, center 100: top=80, bottom=120
        // top=80+40%=96, bottom=120-40%=104 → center 100
        const area: ClickArea = { top: '40%', bottom: '40%' };
        expect(computeImageClickPoint(MATCH, area)).toEqual({ x: 200, y: 100 });
    });

    test('bottom only inset', () => {
        // template 40px tall, center 100: top=80, bottom=120
        // bottom inset 50%: bottom=120-20=100
        // clickable y=[80,100], center=90
        const area: ClickArea = { bottom: '50%' };
        expect(computeImageClickPoint(MATCH, area)).toEqual({ x: 200, y: 90 });
    });
});
