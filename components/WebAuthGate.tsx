import React, { useMemo, useState } from 'react';
import { BRAND_LOGO_SRC, BRAND_NAME, BRAND_TAGLINE } from '../branding';
import { getConfiguredWebCredentials, hasValidWebAuthConfig, persistWebSessionAuth } from '../webAuth';

type WebAuthGateProps = {
  children: React.ReactNode;
};

const inputClassName =
  'w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-base text-white outline-none transition placeholder:text-white/35 focus:border-sky-400/70 focus:bg-white/10';

const WebAuthGate: React.FC<WebAuthGateProps> = ({ children }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const credentials = useMemo(() => getConfiguredWebCredentials(), []);

  if (isAuthenticated) {
    return <>{children}</>;
  }

  const hasConfig = hasValidWebAuthConfig();

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!hasConfig) {
      setError('Configure VITE_WEBTV_LOGIN_USER e VITE_WEBTV_LOGIN_PASSWORD no ambiente.');
      return;
    }

    const normalizedUsername = username.trim();
    const normalizedPassword = password.trim();

    if (normalizedUsername !== credentials.username || normalizedPassword !== credentials.password) {
      setError('Usuario ou senha invalidos.');
      return;
    }

    persistWebSessionAuth();
    setIsAuthenticated(true);
    setError('');
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.25),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(56,189,248,0.18),_transparent_28%),linear-gradient(180deg,_#03111f_0%,_#020817_100%)] text-white">
      <div className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-6 py-10">
        <div className="grid w-full max-w-5xl gap-8 overflow-hidden rounded-[2rem] border border-white/10 bg-[#06101d]/90 shadow-[0_30px_120px_rgba(2,8,23,0.65)] backdrop-blur md:grid-cols-[1.2fr_0.95fr]">
          <section className="flex flex-col justify-between gap-10 px-8 py-10 md:px-12">
            <div className="inline-flex w-fit items-center gap-4 rounded-full border border-white/12 bg-white/6 px-4 py-3">
              <img src={BRAND_LOGO_SRC} alt={BRAND_NAME} className="h-11 w-auto" />
              <div>
                <div className="text-2xl font-black tracking-tight">{BRAND_NAME}</div>
                <div className="text-xs uppercase tracking-[0.28em] text-sky-200/80">{BRAND_TAGLINE}</div>
              </div>
            </div>

            <div className="space-y-5">
              <div className="text-sm font-bold uppercase tracking-[0.35em] text-sky-300/80">Acesso restrito</div>
              <h1 className="max-w-2xl text-4xl font-black leading-tight md:text-5xl">
                Entre com sua conta para acessar a WebTV.
              </h1>
              <p className="max-w-xl text-base leading-7 text-white/68 md:text-lg">
                A autenticacao agora acontece antes da interface principal. Desktop e mobile web exigem login;
                os APKs permanecem fora deste gate.
              </p>
            </div>

            <div className="grid gap-3 text-sm text-white/58 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">Protege o acesso web.</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">Sessao local persistida.</div>
              <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">Credenciais via ambiente.</div>
            </div>
          </section>

          <section className="flex items-center border-t border-white/10 bg-black/18 px-6 py-8 md:border-l md:border-t-0 md:px-8">
            <form onSubmit={handleSubmit} className="w-full space-y-5 rounded-[1.75rem] border border-white/10 bg-black/25 p-6">
              <div className="space-y-1">
                <div className="text-sm font-bold uppercase tracking-[0.24em] text-white/62">Login</div>
                <div className="text-2xl font-black">Autenticacao obrigatoria</div>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-white/78">Usuario</span>
                <input
                  type="text"
                  value={username}
                  onChange={event => setUsername(event.target.value)}
                  className={inputClassName}
                  placeholder="Digite seu usuario"
                  autoComplete="username"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-white/78">Senha</span>
                <input
                  type="password"
                  value={password}
                  onChange={event => setPassword(event.target.value)}
                  className={inputClassName}
                  placeholder="Digite sua senha"
                  autoComplete="current-password"
                />
              </label>

              {error ? (
                <div className="rounded-2xl border border-rose-400/25 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}

              {!hasConfig ? (
                <div className="rounded-2xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                  Login ainda nao configurado no ambiente.
                </div>
              ) : null}

              <button
                type="submit"
                className="w-full rounded-2xl bg-sky-400 px-4 py-3 text-base font-black text-slate-950 transition hover:bg-sky-300"
              >
                Entrar
              </button>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};

export default WebAuthGate;
