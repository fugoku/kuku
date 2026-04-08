import { Match, Show, Switch, createSignal, onMount } from "solid-js";

import OTPInput from "@/components/auth/otp_input";
import {
  type AuthActionState,
  type OAuthProvider,
  getOAuthURL,
  resendEmailCode,
  sendEmailCode,
  verifyEmailCode,
} from "@/lib/api/auth";
import { getProfile } from "@/lib/api/dashboard";

type AuthStep = "email" | "verify";

function getRedirectPath(): string {
  if (typeof window === "undefined") {
    return "/dashboard";
  }

  return new URLSearchParams(window.location.search).get("redirect") ?? "/dashboard";
}

export default function SignInForm() {
  const [step, setStep] = createSignal<AuthStep>("email");
  const [email, setEmail] = createSignal("");
  const [code, setCode] = createSignal("");
  const [emailState, setEmailState] = createSignal<AuthActionState>("idle");
  const [verifyState, setVerifyState] = createSignal<AuthActionState>("idle");
  const [oauthState, setOAuthState] = createSignal<AuthActionState>("idle");
  const [resendState, setResendState] = createSignal<AuthActionState>("idle");
  const [message, setMessage] = createSignal("");

  const isBusy = () =>
    emailState() === "loading" || verifyState() === "loading" || oauthState() === "loading";

  onMount(() => {
    void redirectIfSignedIn();
  });

  async function redirectIfSignedIn() {
    try {
      await getProfile();
      window.location.replace(getRedirectPath());
    } catch {
      // Stay on the sign-in page.
    }
  }

  async function handleEmailSubmit(event: SubmitEvent) {
    event.preventDefault();

    const trimmedEmail = email().trim();
    if (!trimmedEmail) {
      setMessage("Enter an email address.");
      return;
    }

    setEmailState("loading");
    setMessage("");

    try {
      await sendEmailCode(trimmedEmail);
      setEmail(trimmedEmail);
      setEmailState("success");
      setStep("verify");
    } catch {
      setEmailState("error");
      setMessage("Unable to send a code.");
    }
  }

  async function handleVerify() {
    if (code().length !== 6) {
      setMessage("Enter the 6 digit code.");
      return;
    }

    setVerifyState("loading");
    setMessage("");

    try {
      await verifyEmailCode(code());
      setVerifyState("success");
      window.location.href = getRedirectPath();
    } catch {
      setVerifyState("error");
      setMessage("Unable to verify the code.");
    }
  }

  async function handleResend() {
    setResendState("loading");
    setMessage("");

    try {
      await resendEmailCode();
      setResendState("success");
      setMessage("A new code was sent.");
    } catch {
      setResendState("error");
      setMessage("Unable to resend the code.");
    }
  }

  async function handleOAuth(provider: OAuthProvider) {
    setOAuthState("loading");
    setMessage("");

    try {
      window.location.href = await getOAuthURL(provider);
    } catch {
      setOAuthState("error");
      setMessage("Unable to start authentication.");
    }
  }

  function goBack() {
    setStep("email");
    setCode("");
    setMessage("");
    setVerifyState("idle");
  }

  return (
    <Switch>
      <Match when={step() === "verify"}>
        <div class="auth-form">
          <button
            class="auth-back-button"
            disabled={verifyState() === "loading"}
            onClick={goBack}
            type="button"
          >
            Back
          </button>

          <div>
            <h2>Enter verification code</h2>
            <p>
              We sent a code to <span>{email()}</span>
            </p>
          </div>

          <OTPInput disabled={verifyState() === "loading"} onChange={setCode} value={code()} />

          <Show when={message()}>
            <p class={verifyState() === "error" ? "auth-error" : "auth-message"}>{message()}</p>
          </Show>

          <button
            class="auth-submit-button"
            disabled={verifyState() === "loading" || code().length !== 6}
            onClick={handleVerify}
            type="button"
          >
            {verifyState() === "loading" ? "Verifying..." : "Verify"}
          </button>

          <p class="auth-secondary-copy">
            Didn't receive a code?{" "}
            <button disabled={resendState() === "loading"} onClick={handleResend} type="button">
              {resendState() === "loading" ? "Sending..." : "Resend"}
            </button>
          </p>
        </div>
      </Match>

      <Match when={step() === "email"}>
        <div class="auth-form">
          <div class="auth-oauth-stack">
            <button disabled={isBusy()} onClick={() => handleOAuth("google")} type="button">
              Continue with Google
            </button>
            <button disabled={isBusy()} onClick={() => handleOAuth("github")} type="button">
              Continue with GitHub
            </button>
          </div>

          <div class="auth-divider">
            <span>or</span>
          </div>

          <form onSubmit={handleEmailSubmit}>
            <label for="auth-email">Email</label>
            <input
              disabled={isBusy()}
              id="auth-email"
              onInput={(event) => setEmail(event.currentTarget.value)}
              placeholder="Email address"
              required
              type="email"
              value={email()}
            />

            <Show when={message()}>
              <p
                class={
                  emailState() === "error" || oauthState() === "error"
                    ? "auth-error"
                    : "auth-message"
                }
              >
                {message()}
              </p>
            </Show>

            <button class="auth-submit-button" disabled={isBusy()} type="submit">
              {emailState() === "loading" ? "Sending..." : "Continue"}
            </button>
          </form>
        </div>
      </Match>
    </Switch>
  );
}
