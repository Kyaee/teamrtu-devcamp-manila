export type OtpSession = {
  id: string;
  mobileNumber: string;
  verified: boolean;
  createdAt: string;
};

export type FamilyRecord = {
  id: string;
  address: string;
  barangay: string;
  headName: string;
};

export type ReliefClaim = {
  id: string;
  familyId: string;
  eventId: string;
  claimType: "food" | "medical" | "shelter" | "cash";
  createdAt: string;
};

export type DonationIntent = {
  id: string;
  donorName: string;
  amountPhp: number;
  cause: "food" | "medical" | "shelter";
  createdAt: string;
};

export function canClaimReliefForEvent(
  existingClaims: ReliefClaim[],
  familyId: string,
  eventId: string,
) {
  return !existingClaims.some(
    (claim) => claim.familyId === familyId && claim.eventId === eventId,
  );
}
