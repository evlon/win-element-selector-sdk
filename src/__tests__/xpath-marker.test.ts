import { parseXpathMarker } from '../xpath-marker';

test('no marker → findFirst', () => {
    expect(parseXpathMarker('//Button')).toEqual({ xpath: '//Button', mode: 'first' });
});

test(':all marker → findAll', () => {
    expect(parseXpathMarker('//Button:all')).toEqual({ xpath: '//Button', mode: 'all' });
});

test(':onlyone marker → findOne', () => {
    expect(parseXpathMarker('//Button:onlyone')).toEqual({ xpath: '//Button', mode: 'one' });
});

test('marker in attribute value is ignored', () => {
    expect(parseXpathMarker("//Button[@Name='test:onlyone']")).toEqual({
        xpath: "//Button[@Name='test:onlyone']",
        mode: 'first',
    });
});

test('marker after ] is extracted', () => {
    expect(parseXpathMarker('//Button[@Name="发送"]:all')).toEqual({
        xpath: '//Button[@Name="发送"]',
        mode: 'all',
    });
});

test('empty xpath', () => {
    expect(parseXpathMarker('')).toEqual({ xpath: '', mode: 'first' });
});

test('real wechat xpath with :all', () => {
    expect(parseXpathMarker("[fast]//Button[@ClassName='mmui::XImage']:all")).toEqual({
        xpath: "[fast]//Button[@ClassName='mmui::XImage']",
        mode: 'all',
    });
});

test('real wechat xpath with :onlyone', () => {
    expect(parseXpathMarker("[fast]//Button[@Name='发送']:onlyone")).toEqual({
        xpath: "[fast]//Button[@Name='发送']",
        mode: 'one',
    });
});
