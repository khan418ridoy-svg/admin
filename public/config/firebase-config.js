
let firebaseConfigPromise;

export async function getFirebaseConfig() {
  if (!firebaseConfigPromise) {
    firebaseConfigPromise = fetch("/api/config/firebase", {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store"
    })
      .then(async (response) => {
        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(
            result.message || "Unable to load Firebase configuration"
          );
        }

        return result.config;
      })
      .catch((error) => {
        firebaseConfigPromise = null;
        throw error;
      });
  }

  return firebaseConfigPromise;
}
