"use client";

import { LoginForm } from './LoginForm'

export function LoginPage() {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-background">
      <div className="flex flex-1 flex-col overflow-y-auto px-8 py-6">
        <div className="mx-auto flex w-full max-w-xs flex-col my-auto gap-3">
          <div className="flex flex-col items-center gap-3">
            <p className="text-center text-sm font-semibold text-black">
              Welcome to login
            </p>
            <img
              src="/OmniAge_Logo_4K.svg"
              alt="OmniAge Logo"
              width={200}
              height={80}
              className="mx-auto max-w-full h-auto"
            />
          </div>
          <LoginForm />
        </div>
      </div>
      <p className="pb-16 text-center text-xs text-gray-400">
        Build the intelligence and just use it.
      </p>
    </div>
  )
}
