"use client";

import { LoginForm } from './LoginForm'

export function LoginPage() {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-8">
        <div className="flex w-full max-w-sm flex-col">
          <div className="flex flex-col justify-center">
            <div className="mx-auto flex w-full max-w-xs flex-col gap-3">
              <p className="text-center text-sm font-semibold text-black -mb-7">
                Welcome to login
              </p>
              <img
                src="/OmniAge_Logo_4K.svg"
                alt="OmniAge Logo"
                width={200}
                height={80}
                className="mx-auto"
              />
              <LoginForm />
            </div>
          </div>
        </div>
      </div>
      <p className="pb-16 text-center text-xs text-gray-400">
        Build the intelligence and just use it.
      </p>
    </div>
  )
}
