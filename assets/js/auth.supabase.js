// assets/js/auth.supabase.js
import { supabase } from "./config.supabase.js";

/**
 * Guards & session helpers
 * ------------------------
 * requireAuthOrRedirect(): call this in <head> of protected pages.
 * currentUser(): returns the Supabase user (or null).
 * isAuthed(): boolean convenience.
 */
export async function requireAuthOrRedirect(
  loginHref = new URL("./login.html", location.href).toString()
) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    location.replace(loginHref);
    throw new Error("Not authenticated"); // stop page init
  }
  return session;
}

export async function currentUser() {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user || null;
}

export async function isAuthed() {
  return !!(await currentUser());
}

/**
 * Login / Logout
 * --------------
 * loginUser(email, password): signs in with Supabase
 *   - STEP 8: also saves identifiers in localStorage so your existing
 *     script.js (localStorage flows) continue to work without changes.
 * logoutUser(): clears Supabase session and local localStorage markers.
 */
export async function loginUser(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(error.message || "Login failed");

  // ✅ STEP 8: Wire Supabase identity into your existing app state
  if (data?.user) {
    localStorage.setItem("currentUser", data.user.id);
    localStorage.setItem("currentUserEmail", data.user.email || "");
    // (Optional) mark that auth is Supabase-based for future logic
    localStorage.setItem("authProvider", "supabase");
  }

  return data.user;
}

export async function logoutUser() {
  // Clear Supabase session
  await supabase.auth.signOut();

  // Clean any local markers we set in login
  localStorage.removeItem("currentUser");
  localStorage.removeItem("currentUserEmail");
  localStorage.removeItem("authProvider");

  // (Optional) keep your app's existing local caches, or clear them:
  // localStorage.removeItem("deliveryAppState");
  // localStorage.removeItem("earningsSummary");

  location.replace(new URL("./login.html", location.href).toString());
}

/**
 * Optional: listen to auth changes if you ever need to react globally.
 * (e.g., auto-redirect on sign-out in another tab)
 */
supabase.auth.onAuthStateChange((event, session) => {
  // Example:
  // if (event === "SIGNED_OUT") location.replace("pages/login.html");
  // console.log("[auth change]", event, !!session);
});
