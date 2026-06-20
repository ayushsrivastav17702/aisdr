import { openaiHelper } from "./openai-helper";
import { storage } from "../storage";

export interface LinkedInData {
  profileText?: string;
  headline?: string;
  recentPosts?: string[];
  recentComments?: string[];
  skills?: string[];
}

export interface PersonalizationResponse {
  linkedInAnalysis: {
    professionalFocus: string[];
    painPoints: string[];
    recentInterests: string[];
  };
  email: {
    subject: string;
    body: string;
  };
  personalizationScore: number;
}

export async function generatePersonalizedEmail(
  prospectId: string,
  linkedInData: LinkedInData
): Promise<PersonalizationResponse> {
  const prospect = await storage.getProspect(prospectId);

  if (!prospect) {
    throw new Error("Prospect not found");
  }

  const systemPrompt = "You are a B2B sales email expert. Generate highly personalized, engaging emails based on LinkedIn data. Be specific, reference real details, and create authentic connection points. Always respond with valid JSON.";

  const prompt = `Analyze LinkedIn data and generate a highly personalized B2B sales email:

Prospect: ${prospect.firstName || ""} ${prospect.lastName || ""}
Company: ${prospect.companyName || "Unknown"}
Title: ${prospect.jobTitle || "Unknown"}

LinkedIn Data:
Profile: ${linkedInData.profileText || "N/A"}
Headline: ${linkedInData.headline || "N/A"}
Recent Posts: ${linkedInData.recentPosts?.join("\n") || "None"}
Recent Comments: ${linkedInData.recentComments?.join("\n") || "None"}
Skills: ${linkedInData.skills?.join(", ") || "None"}

Generate a JSON response with:
1. Analysis of their professional focus, pain points, and recent interests
2. A personalized email (subject and body) that references specific details from their LinkedIn
3. A personalization score (0-100) indicating how tailored the email is

Format:
{
  "analysis": {
    "professionalFocus": ["focus area 1", "focus area 2"],
    "painPoints": ["pain point 1", "pain point 2"],
    "recentInterests": ["interest 1", "interest 2"]
  },
  "email": {
    "subject": "Personalized subject line",
    "body": "Personalized email body with specific references to their LinkedIn activity"
  },
  "personalizationScore": 85
}`;

  try {
    const response: any = await openaiHelper.callWithFallback(
      (groqClient) =>
        groqClient.chat.completions.create({
          model: "llama-3.3-70b-versatile",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 1500,
        } as any),
      (client) =>
        client.chat.completions.create({
          model: "deepseek-chat",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 1500,
        })
    );

    const responseText = response.choices[0].message.content || "{}";
    const result = JSON.parse(responseText);

    return {
      linkedInAnalysis: result.analysis,
      email: result.email,
      personalizationScore: result.personalizationScore || 0,
    };
  } catch (error) {
    console.error("Personalization error:", error);
    throw new Error("Failed to generate personalized email");
  }
}
