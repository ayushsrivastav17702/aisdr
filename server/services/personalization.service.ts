import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { storage } from "../storage";

const openai = process.env.OPENAI_API_KEY ? new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
}) : null;

const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
}) : null;

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
    let responseText: string;

    // Try OpenAI first
    if (openai) {
      try {
        const completion = await openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: "You are a B2B sales email expert. Generate highly personalized, engaging emails based on LinkedIn data. Be specific, reference real details, and create authentic connection points. Always respond with valid JSON."
            },
            { role: "user", content: prompt }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 1500,
        });

        responseText = completion.choices[0].message.content || "{}";
      } catch (openaiError: any) {
        console.error("OpenAI error:", openaiError?.message || openaiError);
        
        // If OpenAI fails, try Anthropic
        if (anthropic) {
          console.log("Falling back to Anthropic Claude...");
          const completion = await anthropic.messages.create({
            model: "claude-sonnet-4-20250514",
            max_tokens: 1500,
            temperature: 0.7,
            system: "You are a B2B sales email expert. Generate highly personalized, engaging emails based on LinkedIn data. Be specific, reference real details, and create authentic connection points. Always respond with valid JSON.",
            messages: [
              { role: "user", content: prompt }
            ],
          });

          responseText = completion.content[0].type === 'text' ? completion.content[0].text : "{}";
        } else {
          throw openaiError;
        }
      }
    } else if (anthropic) {
      // Use Anthropic if OpenAI is not configured
      const completion = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        temperature: 0.7,
        system: "You are a B2B sales email expert. Generate highly personalized, engaging emails based on LinkedIn data. Be specific, reference real details, and create authentic connection points. Always respond with valid JSON.",
        messages: [
          { role: "user", content: prompt }
        ],
      });

      responseText = completion.content[0].type === 'text' ? completion.content[0].text : "{}";
    } else {
      throw new Error("No AI provider configured. Please set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
    }

    const result = JSON.parse(responseText);

    // Note: This function doesn't have RequestContext, but it should be called through routes.ts
    // which does have userContext. For now, we'll skip storing results here since it's missing ctx.
    // The intelligentPersonalizationService already stores results with proper userId.
    // TODO: Refactor this function to accept RequestContext if needed separately

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
