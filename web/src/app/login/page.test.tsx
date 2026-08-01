import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "./page";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: navigation.replace }),
}));

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  window.history.replaceState({}, "", "/login");
  navigation.replace.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function signIn() {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText("Email"), "person@example.com");
  await user.type(screen.getByLabelText("Password"), "password123");
  await user.click(screen.getByRole("button", { name: /Enter workspace/ }));
}

describe("LoginPage", () => {
  it("signs in with credentials and returns to a safe app path (AC 8)", async () => {
    window.history.replaceState({}, "", "/login?returnTo=%2Fapp%2Fchat%2Fconv_1");
    const fetchMock = vi.fn().mockResolvedValue(response({ id: "user_1" }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LoginPage />);

    await signIn();

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/auth\/login$/),
      expect.objectContaining({
        method: "POST",
        credentials: "include",
        body: JSON.stringify({
          email: "person@example.com",
          password: "password123",
        }),
      }),
    );
    expect(navigation.replace).toHaveBeenCalledWith("/app/chat/conv_1");
  });

  it("rejects a protocol relative return path (AC 8)", async () => {
    window.history.replaceState({}, "", "/login?returnTo=%2F%2Fevil.example");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response({ id: "user_1" })));
    render(<LoginPage />);

    await signIn();

    expect(navigation.replace).toHaveBeenCalledWith("/app");
  });

  it("announces invalid credentials and associates the error with both inputs (AC 8)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(response({ error: "INVALID_CREDENTIALS" }, 401)),
    );
    render(<LoginPage />);

    await signIn();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That email and password do not match.");
    expect(screen.getByLabelText("Email")).toHaveAttribute(
      "aria-describedby",
      "login-error",
    );
    expect(screen.getByLabelText("Password")).toHaveAttribute(
      "aria-describedby",
      "login-error",
    );
  });

  it("shows a safe error when the API cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("secret host")));
    render(<LoginPage />);

    await signIn();

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The Sochestral API is unavailable. Please try again.",
    );
    expect(screen.queryByText("secret host")).not.toBeInTheDocument();
  });
});
