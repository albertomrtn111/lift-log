import assert from 'node:assert/strict'
import test from 'node:test'
import {
    brandingCss,
    contrastRatio,
    isHexColor,
    isReadablePrimary,
    NEXTRAIN_PRIMARY,
    parseBranding,
} from '../src/lib/branding/branding-rules.js'

test('solo admite colores hexadecimales de 6 cifras', () => {
    assert.equal(isHexColor('#0058D8'), true)
    assert.equal(isHexColor('#fff'), false)
    assert.equal(isHexColor('red'), false)
    assert.equal(isHexColor('#000000;}body{display:none'), false)
    assert.equal(isHexColor(null), false)
})

test('calcula el contraste', () => {
    assert.ok(Math.abs(contrastRatio('#000000', '#ffffff') - 21) < 0.01)
    assert.ok(contrastRatio(NEXTRAIN_PRIMARY, '#ffffff') > 4.5)
})

test('un color que no se lee sobre blanco no se usa', () => {
    assert.equal(isReadablePrimary('#FFE600'), false)
    assert.equal(brandingCss('#FFE600'), null)
    assert.equal(brandingCss('no es un color'), null)
    assert.equal(brandingCss(null), null)
})

test('el tema define claro y oscuro', () => {
    const css = brandingCss('#7A1FA2')
    assert.match(css, /^:root\{--primary:/)
    assert.match(css, /\.dark\{--primary:/)
    assert.match(css, /--primary-fill:/)
    assert.match(css, /--primary-foreground:0 0% 100%/)
})

test('con un color medio, el texto del botón va oscuro', () => {
    assert.ok(contrastRatio('#D9730D', '#ffffff') < 4.5)
    assert.match(brandingCss('#D9730D'), /--primary-foreground:0 0% 7%/)
})

test('en oscuro el color se aclara hasta leerse', () => {
    const light = brandingCss('#123A6B').match(/:root\{--primary:\S+ \S+ ([\d.]+)%/)[1]
    const dark = brandingCss('#123A6B').match(/\.dark\{--primary:\S+ \S+ ([\d.]+)%/)[1]
    assert.ok(Number(dark) > Number(light))
})

test('valida textos y colores', () => {
    assert.deepEqual(parseBranding({ displayName: ' ClubØ ', primaryColor: '', accentColor: null, reportFooter: ' Pie ' }), {
        values: { displayName: 'ClubØ', primaryColor: null, accentColor: null, reportFooter: 'Pie' },
    })
    assert.match(parseBranding({ displayName: 'x'.repeat(81) }).error, /nombre/)
    assert.match(parseBranding({ reportFooter: 'x'.repeat(301) }).error, /pie/)
    assert.match(parseBranding({ primaryColor: 'azul' }).error, /principal/)
    assert.match(parseBranding({ accentColor: 'azul' }).error, /acento/)
})
