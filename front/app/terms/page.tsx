export const metadata = {
  title: '이용약관 | Bookmarker',
}

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-gray-800 dark:text-gray-200">
      <h1 className="mb-2 text-3xl font-bold">이용약관</h1>
      <p className="mb-10 text-sm text-gray-500">시행일: 2026년 6월 28일</p>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">1. 서비스 범위</h2>
        <p className="text-sm leading-relaxed">
          Bookmarker(이하 &ldquo;서비스&rdquo;)는 사용자가 저장한 웹페이지 URL·제목을 기반으로
          AI 자동 태깅, 벡터 유사도 검색 기능을 제공합니다.
          웹페이지 본문은 AI 처리 목적으로만 사용되며 데이터베이스에 저장되지 않습니다.
          서비스는 Chrome Extension과 웹 애플리케이션으로 구성됩니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">2. 이용 자격</h2>
        <p className="text-sm leading-relaxed">
          Google 계정을 통한 OAuth 인증으로 서비스를 이용할 수 있습니다.
          이용자는 본 약관에 동의함으로써 서비스 이용 자격을 갖습니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">3. 사용자 콘텐츠 및 저작권 책임</h2>
        <p className="mb-2 text-sm leading-relaxed">
          이용자가 저장하는 URL·제목에 대한 저작권 및 법적 책임은 이용자 본인에게 있습니다.
          서비스는 이용자가 저장한 콘텐츠의 저작권 침해에 대해 책임을 지지 않습니다.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>타인의 저작물을 무단으로 수집·저장하는 행위 금지</li>
          <li>불법 콘텐츠 링크 저장 금지</li>
          <li>서비스를 통한 저작권법 위반 시 모든 민·형사상 책임은 이용자에게 있음</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">4. 웹페이지 본문 처리</h2>
        <p className="text-sm leading-relaxed">
          북마크 저장 시 Chrome Extension이 수집하는 웹페이지 본문(content)은
          AI 태그 생성 및 임베딩 변환에만 사용되며, 처리 완료 즉시 파기됩니다.
          본문은 당사 데이터베이스에 저장되지 않으며 제3자에게 제공되지 않습니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">5. robots.txt 미준수 사이트 면책</h2>
        <p className="text-sm leading-relaxed">
          이용자가 robots.txt를 통해 크롤링을 제한한 사이트의 콘텐츠를 저장하는 경우,
          해당 행위에 대한 법적 책임은 이용자 본인에게 있습니다.
          서비스는 개별 사이트의 이용 정책 준수 여부를 확인하지 않으며,
          이로 인한 분쟁에 대해 책임을 지지 않습니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">6. 서비스 변경·중단</h2>
        <p className="text-sm leading-relaxed">
          운영자는 서비스의 전부 또는 일부를 사전 고지 후 변경하거나 중단할 수 있습니다.
          서비스 중단 시 저장된 데이터를 내보낼 수 있도록 30일 이상의 유예 기간을 제공합니다.
          불가피한 사유(천재지변, 시스템 장애 등)로 인한 갑작스러운 중단에 대해서는 책임을 지지 않습니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">7. 면책 조항</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>AI 태깅 결과의 정확성은 보장하지 않습니다.</li>
          <li>외부 AI 서비스(OpenAI) 장애로 인한 기능 미제공에 대해 책임을 지지 않습니다.</li>
          <li>이용자 귀책으로 인한 계정 접근 불가에 대해 책임을 지지 않습니다.</li>
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">8. 약관 변경</h2>
        <p className="text-sm leading-relaxed">
          본 약관은 관련 법령·서비스 정책 변경 시 개정될 수 있으며,
          변경 시 7일 전 서비스 내 공지합니다.
          변경 후 계속 이용 시 개정 약관에 동의한 것으로 간주합니다.
        </p>
      </section>
    </div>
  )
}
