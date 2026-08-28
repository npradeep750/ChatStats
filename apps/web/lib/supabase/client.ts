import { createBrowserClient } from "@supabase/ssr";

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

export type Profile = {
  username: string;
  avatar_url: string;
};

async function currentUserId(): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;
  const { data } = await createClient().auth.getUser();
  return data.user?.id ?? null;
}

export async function getProfileFromSupabase(): Promise<Profile> {
  const empty: Profile = { username: "", avatar_url: "" };
  const userId = await currentUserId();
  if (!userId) return empty;
  const { data } = await createClient()
    .from("user_profiles")
    .select("username, avatar_url")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return empty;
  return {
    username: (data.username as string | undefined) ?? "",
    avatar_url: (data.avatar_url as string | undefined) ?? "",
  };
}

export async function saveProfileToSupabase(profile: Profile) {
  const userId = await currentUserId();
  if (!userId) return;
  await createClient()
    .from("user_profiles")
    .upsert(
      { user_id: userId, username: profile.username, avatar_url: profile.avatar_url },
      { onConflict: "user_id" },
    );
}

export async function uploadAvatarToSupabase(
  file: File,
): Promise<string | null> {
  const userId = await currentUserId();
  if (!userId) return null;
  const extension = file.name.split(".").pop() ?? "png";
  const path = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await createClient()
    .storage.from("avatars")
    .upload(path, file, { upsert: true });
  if (error) return null;
  const { data } = createClient().storage.from("avatars").getPublicUrl(path);
  return data.publicUrl;
}

export async function removeAvatarFromSupabase(avatarUrl: string): Promise<void> {
  const userId = await currentUserId();
  if (!userId || !avatarUrl) return;
  const path = avatarUrl.split("/avatars/")[1];
  if (!path) return;
  await createClient().storage.from("avatars").remove([path]);
}
