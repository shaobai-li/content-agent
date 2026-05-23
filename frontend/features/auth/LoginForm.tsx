"use client";

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Button } from '@/shared/ui/button'
import { Input } from '@/shared/ui/input'
import { login, setToken } from '@/shared/api/auth'
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
      authLogin(username)
    } catch (e) {
      setError(e instanceof Error ? e.message : '登录失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 px-4">
      <Input
        placeholder="用户名"
        aria-label="用户名"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        disabled={loading}
      />
      <Input
        type="password"
        placeholder="密码"
        aria-label="密码"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        disabled={loading}
        onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
      />
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
      <Button
        type="button"
        className="w-full"
        onClick={handleSubmit}
        disabled={loading}
      >
        {loading && <Loader2 className="animate-spin" />}
        {loading ? '登录中...' : '登录'}
      </Button>
    </div>
  )
}
