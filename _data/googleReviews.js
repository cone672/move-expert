import EleventyFetch from "@11ty/eleventy-fetch";

export default async function () {
  const apiKey = process.env.GOOGLE_API_KEY;
  const placeId = process.env.GOOGLE_PLACE_ID;

  if (!apiKey || !placeId) {
    console.warn(
      "[googleReviews] GOOGLE_API_KEY or GOOGLE_PLACE_ID not set — skipping fetch."
    );
    return null;
  }

  const url = `https://places.googleapis.com/v1/places/${placeId}?fields=displayName,rating,userRatingCount,reviews,googleMapsUri&key=${apiKey}`;

  try {
    const data = await EleventyFetch(url, {
      duration: "1d",
      type: "json",
      directory: ".cache",
    });

    return {
      name: data.displayName?.text ?? null,
      rating: data.rating ?? null,
      total: data.userRatingCount ?? 0,
      reviews: (data.reviews ?? []).map((r) => ({
        author: r.authorAttribution?.displayName ?? "Anoniman",
        photo: r.authorAttribution?.photoUri ?? null,
        rating: r.rating,
        stars: "★".repeat(r.rating ?? 0) + "☆".repeat(5 - (r.rating ?? 0)),
        text: r.originalText?.text ?? r.text?.text ?? "",
        lang: r.originalText?.languageCode ?? r.text?.languageCode ?? "",
        relativeTime: r.relativePublishTimeDescription ?? "",
        url: r.googleMapsUri ?? r.authorAttribution?.uri ?? null,
      })),
      placeUrl: data.googleMapsUri ?? null,
    };
  } catch (err) {
    console.warn("[googleReviews] fetch failed:", err.message);
    return null;
  }
}
