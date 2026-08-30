import { getChatGPTUser } from "../chatgpt-auth";

export default async function AccessPendingPage() {
  const user = await getChatGPTUser();
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f4f3ed", fontFamily: "sans-serif", color: "#17201c" }}><section style={{ maxWidth: 520, padding: 36, border: "1px solid #d9dbd5", borderRadius: 18, background: "white" }}><p style={{ color: "#1f5b45", fontWeight: 700 }}>접근 승인 필요</p><h1>관리자 확인을 기다리고 있어요.</h1><p>{user?.email ?? "현재 계정"}의 로그인은 확인되었습니다. 관리자가 인원 DB의 스탭과 계정을 연결하면 이용할 수 있습니다.</p></section></main>;
}
