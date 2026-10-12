import test from 'node:test'
import assert from 'node:assert/strict'

const { authErrorMessage, classifyAuthError, safeRedirectPath } = await import('../src/lib/auth/auth-errors.ts')

test('traduce los errores habituales de Supabase', () => {
    assert.equal(classifyAuthError({ message: 'Invalid login credentials' }), 'invalid_credentials')
    assert.equal(classifyAuthError({ message: 'Email not confirmed' }), 'email_not_confirmed')
    assert.equal(classifyAuthError({ message: 'User already registered' }), 'already_registered')
    assert.equal(classifyAuthError({ message: 'Password should be at least 6 characters.' }), 'weak_password')
    assert.equal(classifyAuthError({ message: 'New password should be different from the old password.' }), 'same_password')
    assert.equal(classifyAuthError({ message: 'For security purposes, you can only request this after 42 seconds.' }), 'rate_limited')
    assert.equal(classifyAuthError({ message: 'Email link is invalid or has expired', code: 'otp_expired' }), 'expired_link')
    assert.equal(classifyAuthError(new TypeError('Failed to fetch')), 'network')
})

test('los errores desconocidos no muestran texto técnico', () => {
    assert.equal(classifyAuthError({ message: 'Database error saving new user' }), 'unknown')
    assert.match(authErrorMessage(null), /Algo ha fallado/)
})

test('solo acepta redirecciones internas', () => {
    assert.equal(safeRedirectPath('/coach/billing'), '/coach/billing')
    assert.equal(safeRedirectPath('/set-password?mode=reset'), '/set-password?mode=reset')
    assert.equal(safeRedirectPath('https://evil.example'), '/')
    assert.equal(safeRedirectPath('//evil.example'), '/')
    assert.equal(safeRedirectPath('/\\evil.example'), '/')
    assert.equal(safeRedirectPath(null, '/login'), '/login')
})
