export const metadata = {
  title: '개인정보처리방침 | Mowaba',
}

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 text-gray-800">
      <h1 className="mb-2 text-3xl font-bold">개인정보처리방침</h1>
      <p className="mb-10 text-sm text-gray-500">시행일: 2026년 6월 28일</p>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">1. 수집하는 개인정보 항목</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>이메일 주소 (Google, Kakao OAuth 인증 — 카카오는 계정 설정에 따라 미제공될 수 있음)</li>
          <li>저장한 웹페이지 URL 및 제목</li>
          <li>AI 분류를 위한 태그 정보</li>
          <li>검색·추천을 위한 벡터 임베딩 (원문 복원 불가)</li>
        </ul>
        <p className="mt-2 text-sm text-gray-500">
          ※ 웹페이지 본문(content)은 AI 처리 즉시 파기하며, 데이터베이스에 저장하지 않습니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">2. 개인정보의 수집·이용 목적</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li>북마크 저장, 조회, 검색 서비스 제공</li>
          <li>AI 자동 태깅 및 벡터 유사도 검색 기능 제공</li>
          <li>회원 식별 및 인증</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">3. 개인정보의 보유·이용 기간</h2>
        <p className="text-sm leading-relaxed">
          회원 탈퇴 시 저장된 모든 북마크 및 개인정보를 즉시 파기합니다.
          법령에 별도 규정이 있는 경우 해당 기간 동안 보관할 수 있습니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">4. 개인정보의 국외 이전 (위탁)</h2>
        <p className="mb-3 text-sm">
          서비스 운영을 위해 아래 수탁자에게 개인정보 처리를 위탁합니다.
          수탁자는 미국에 서버를 두고 있으며, 위탁 목적 범위 내에서만 처리합니다.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-200 px-3 py-2 text-left">수탁자</th>
                <th className="border border-gray-200 px-3 py-2 text-left">국가</th>
                <th className="border border-gray-200 px-3 py-2 text-left">위탁 목적</th>
                <th className="border border-gray-200 px-3 py-2 text-left">거부 방법</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-200 px-3 py-2">OpenAI</td>
                <td className="border border-gray-200 px-3 py-2">미국</td>
                <td className="border border-gray-200 px-3 py-2">AI 태깅 및 임베딩 생성 (본문 즉시 파기, 학습 미사용)</td>
                <td className="border border-gray-200 px-3 py-2">회원 탈퇴</td>
              </tr>
              <tr className="bg-gray-50">
                <td className="border border-gray-200 px-3 py-2">Supabase</td>
                <td className="border border-gray-200 px-3 py-2">미국</td>
                <td className="border border-gray-200 px-3 py-2">데이터베이스 저장 및 인증</td>
                <td className="border border-gray-200 px-3 py-2">회원 탈퇴</td>
              </tr>
              <tr>
                <td className="border border-gray-200 px-3 py-2">Vercel</td>
                <td className="border border-gray-200 px-3 py-2">미국</td>
                <td className="border border-gray-200 px-3 py-2">웹 서버 및 서버리스 함수 실행</td>
                <td className="border border-gray-200 px-3 py-2">회원 탈퇴</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">5. OpenAI 데이터 처리 방침</h2>
        <p className="text-sm leading-relaxed">
          OpenAI API를 통해 처리되는 웹페이지 본문은 AI 모델 학습 데이터로 사용되지 않습니다.
          본문은 태그 생성 및 임베딩 변환 완료 즉시 파기되며, 당사 데이터베이스에 저장되지 않습니다.
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">6. 이용자 권리 및 행사 방법</h2>
        <p className="mb-2 text-sm leading-relaxed">
          이용자는 언제든지 다음 권리를 행사할 수 있습니다.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">
          <li><strong>열람</strong>: 설정 페이지 &gt; 내 데이터 내보내기</li>
          <li><strong>삭제·파기</strong>: 설정 페이지 &gt; 회원 탈퇴</li>
          <li><strong>이메일 문의</strong>: 아래 개인정보 보호책임자 연락처</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-semibold">7. 개인정보 보호책임자</h2>
        <p className="text-sm leading-relaxed">
          성명: AI Camp 7기 2팀<br />
          이메일: privacy@mowaba.example.com
        </p>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">8. 방침 변경 고지</h2>
        <p className="text-sm leading-relaxed">
          본 방침은 법령·서비스 변경 시 개정될 수 있으며, 변경 시 7일 전 서비스 내 공지합니다.
        </p>
      </section>
    </div>
  )
}
