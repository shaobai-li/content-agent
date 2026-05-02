"use client"

import * as React from "react"

import { cn } from "@/shared/lib/cn"

const skillsFileInputClass = cn(
  "file:text-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input h-9 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:shrink-0 file:cursor-pointer file:self-center file:rounded-md file:border-0 file:bg-secondary file:px-3 file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
  "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
)

export function SkillsFileInput({ className }: { className?: string }) {
  const [files, setFiles] = React.useState<File[] | null>(null)

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <input
        type="file"
        multiple
        className={skillsFileInputClass}
        onChange={(e) =>
          setFiles(e.target.files?.length ? Array.from(e.target.files) : null)
        }
      />
      {files && files.length > 0 ? (
        <ul className="max-h-24 overflow-y-auto text-xs text-muted-foreground">
          {files.map((f) => (
            <li key={`${f.name}-${f.size}-${f.lastModified}`} className="truncate py-0.5">
              {f.name}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
