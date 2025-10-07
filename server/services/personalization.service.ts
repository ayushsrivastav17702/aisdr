import OpenAI from "openai";
import { storage } from "../storage";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

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
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        {
          role: "system",
          content: "You are a B2B sales email expert. Generate highly personalized, engaging emails based on LinkedIn data. Be specific, reference real details, and create authentic connection points."
        },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 1500,
    });

    const responseText = completion.choices[0].message.content || "{}";
    const result = JSON.parse(responseText);

    await storage.createPersonalizationResult({
      prospectId,
      personalizationScore: result.personalizationScore || 0,
      insights: result.analysis,
      emailSuggestions: result.email,
      linkedinData: linkedInData,
    });

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
