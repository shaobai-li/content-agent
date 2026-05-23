"use client";

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { login, setToken, getMe } from '@/shared/api/auth'
import { useAuth } from '@/entities/auth/store'

export function LoginForm() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const { login: authLogin } = useAuth()

  const handleSubmit = async () => {
    if (!username || !password) {
      setError('用户名和密码不能为空')
      return
    }

    setLoading(true)
    setError('')

    try {
      const token = await login(username, password)
      setToken(token)
      const user = await getMe()
      authLogin(user)
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className="flex flex-col gap-4 px-4" onSubmit={(e) => { e.preventDefault(); handleSubmit(); }}>
      <Input
        placeholder="用户名"
        aria-label="用户名"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        disabled={loading}
        autoComplete="off"
      />
      <Input
        type="password"
        placeholder="密码"
        aria-label="密码"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={loading}
        autoComplete="new-password"
      />
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <Button
        type="submit"
        className="w-full"
        disabled={loading}
      >
        {loading && <Loader2 className="animate-spin" />}
        {loading ? '登录中...' : '登录'}
      </Button>
    </form>
  )
}
