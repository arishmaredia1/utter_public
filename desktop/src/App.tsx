import { useSession } from "@/store/session";
import { Login } from "@/screens/Login";

export function App() {
  const token = useSession((s) => s.token);
  if (!token) return <Login />;
  return (
    <main className="p-12">
      <h1 className="font-display text-5xl tracking-tightest font-bold">Logged in.</h1>
      <p className="text-text-1 mt-2">Idle screen comes next.</p>
    </main>
  );
}
