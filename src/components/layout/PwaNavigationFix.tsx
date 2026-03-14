'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function PwaNavigationFix() {
  const router = useRouter()
  useEffect(() => {
    if (!(window.navigator as any).standalone) return
    const handler = (e: MouseEvent) => {
      const anchor = (e.target as Element).closest('a')
      if (!anchor || !anchor.href) return
      const url = new URL(anchor.href)
      if (url.origin !== window.location.origin) return
      e.preventDefault()
      router.push(url.pathname + url.search)
    }
    document.addEventListener('click', handler)
    return () => document.removeEventListener('click', handler)
  }, [router])
  return null
}
