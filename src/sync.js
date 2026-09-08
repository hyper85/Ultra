import { createClient } from "@supabase/supabase-js";

/* Cloud sync via Supabase. The app is local-first: everything lives in localStorage and works without an account.
   When VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are set (Vercel → Settings → Environment Variables) and the user
   logs in, profile, log and activities are mirrored to the ultraplan_user_data table (see supabase/schema.sql). */

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
export const supabase = url && key ? createClient(url, key, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
export const syncEnabled = !!supabase;

export const sendLoginLink = async (email) => {
  const { error } = await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin + window.location.pathname } });
  if (error) throw error;
};

export const signOut = () => supabase.auth.signOut();

export const pullRemote = async (userId) => {
  const { data, error } = await supabase.from("ultraplan_user_data").select("profile, log, activities, updated_at").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return data ? { ...data, updatedAt: new Date(data.updated_at).getTime() } : null;
};

export const pushRemote = async (userId, { profile, log, activities, updatedAt }) => {
  const { error } = await supabase.from("ultraplan_user_data").upsert({ user_id: userId, profile, log, activities, updated_at: new Date(updatedAt || Date.now()).toISOString() }, { onConflict: "user_id" });
  if (error) throw error;
};

// Sign in with the 6-digit code from the email (the Magic Link template must include {{ .Token }}).
export const verifyCode = async (email, token) => {
  const { data, error } = await supabase.auth.verifyOtp({ email, token: String(token).replace(/\D/g, ""), type: "email" });
  if (error) throw error;
  return data;
};
