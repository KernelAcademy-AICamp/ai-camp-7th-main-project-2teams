export const metadata = {
  title: '탈퇴 완료 | Bookmarker',
}

export default function GoodbyePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center dark:bg-gray-950">
      <h1 className="mb-3 text-2xl font-bold text-gray-900 dark:text-gray-100">
        탈퇴가 완료되었습니다
      </h1>
      <p className="mb-8 text-sm text-gray-500">
        모든 데이터가 파기되었습니다. 이용해 주셔서 감사합니다.
      </p>
      <a
        href="/login"
        className="rounded-md bg-indigo-600 px-5 py-2 text-sm text-white hover:bg-indigo-700"
      >
        로그인 페이지로
      </a>
    </div>
  )
}
