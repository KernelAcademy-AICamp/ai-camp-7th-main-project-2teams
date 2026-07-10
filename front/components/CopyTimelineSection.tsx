'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Link2, Sparkles } from 'lucide-react'

interface Step {
  time: string
  title: string
  desc: string
  icon: typeof Link2
}

const STEPS: Step[] = [
  {
    time: '0:00',
    title: '링크 붙여넣기',
    desc: 'URL 한 줄만 붙여넣으면 끝',
    icon: Link2,
  },
  {
    time: '0:01',
    title: '저장은 1초',
    desc: '제목까지 자동으로 채워집니다',
    icon: Check,
  },
  {
    time: '+2s',
    title: '정리는 AI가 합니다',
    desc: '카테고리·태그가 순서대로 완성',
    icon: Sparkles,
  },
]

const TAGS = ['#React', '#프론트엔드', '#추후정리']

/**
 * 히어로 카피("저장은 1초, 정리는 AI가 합니다")를 3단계 타임라인 시나리오로 재해석한 섹션.
 * 뷰포트 진입 시 1회 재생 — IntersectionObserver로 스크롤 트리거, 페이지 로드 애니메이션과 분리.
 */
export function CopyTimelineSection() {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const node = sectionRef.current
    if (!node) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
          observer.disconnect()
        }
      },
      { threshold: 0.35 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return (
    <section ref={sectionRef} aria-label="저장부터 정리까지 과정" className="py-20">
      <div className="mx-auto mb-14 max-w-xl text-center">
        <p className="mb-3 text-xs font-extrabold tracking-wider text-brand-strong uppercase">
          How it works
        </p>
        <h2 className="text-2xl font-extrabold tracking-tight text-ink sm:text-3xl">
          붙여넣는 순간부터, 초 단위로 보여드릴게요
        </h2>
      </div>

      <div className="relative mx-auto max-w-3xl">
        {/* 연결선 — 진입 시 왼쪽→오른쪽으로 채워짐 */}
        <div
          aria-hidden="true"
          className="absolute top-6 right-6 left-6 hidden h-px bg-line sm:block"
        >
          <div
            className="h-full origin-left bg-gradient-to-r from-brand to-mint transition-transform duration-[1400ms] ease-out"
            style={{ transform: isVisible ? 'scaleX(1)' : 'scaleX(0)' }}
          />
        </div>

        <ol className="relative grid gap-8 sm:grid-cols-3 sm:gap-6">
          {STEPS.map((step, i) => (
            <li
              key={step.time}
              className={`flex flex-col items-center text-center opacity-0 sm:items-center ${
                isVisible ? 'animate-rise' : ''
              }`}
              style={{ animationDelay: `${i * 260}ms` }}
            >
              <span
                className={`gradient-brand relative z-10 mb-4 flex h-12 w-12 items-center justify-center rounded-full text-white shadow-[0_10px_20px_-8px_rgba(45,111,209,.55)] ${
                  i === 2 ? 'ring-4 ring-mint-soft' : ''
                }`}
              >
                <step.icon className="h-5 w-5" aria-hidden="true" />
              </span>

              <span className="mb-1.5 font-mono text-xs font-bold text-text-secondary">
                {step.time}
              </span>
              <h3 className="mb-1 text-lg font-extrabold tracking-tight text-ink">
                {step.title}
              </h3>
              <p className="text-sm text-text-secondary">{step.desc}</p>

              {i === 2 && (
                <div className="mt-4 flex flex-wrap justify-center gap-2" aria-hidden="true">
                  {TAGS.map((tag, tagIndex) => (
                    <span
                      key={tag}
                      className={`rounded-full bg-mint-soft px-3 py-1 text-xs font-bold text-ink opacity-0 ${
                        isVisible ? 'animate-tag-in' : ''
                      }`}
                      style={{ animationDelay: `${900 + tagIndex * 180}ms` }}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}
