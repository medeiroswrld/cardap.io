export type FeedbackData = {
  likes: number;
  commentCount: number;
  comments: {
    id: string;
    comment: string;
    liked: boolean;
    updated_at: string;
  }[];
  eligibleOrderId: string | null;
  mine: { liked: boolean; comment: string } | null;
  googleReviewUrl: string;
};

export function isGoogleReviewUrl(value: string) {
  return (
    value === "" ||
    (value.length <= 500 &&
      /^https:\/\/(g\.page\/[^?#]+\/review|search\.google\.com\/local\/writereview\?placeid=[^&\s]+|www\.google\.com\/maps\/[^\s]+|maps\.app\.goo\.gl\/[^\s]+)$/.test(
        value,
      ))
  );
}
