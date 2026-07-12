import { withSubject } from "@/lib/api";
import { keepChain } from "@/lib/chain/keep";

/** Typing the daily mantra keeps the chain (A7). */
export async function POST() {
  return withSubject(async (userId) => {
    const result = await keepChain(userId, "mantra");
    return result;
  });
}
