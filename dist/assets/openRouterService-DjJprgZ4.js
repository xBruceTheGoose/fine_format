import{F as h,S as E,I as p}from"./index-C8VoLNLa.js";class R{constructor(){this.apiKey=null,this.isInitialized=!1,this.baseUrl="https://openrouter.ai/api/v1/chat/completions",this.initialize()}initialize(){const a="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";if(console.log("[OPENROUTER] All environment variables:"),console.log("[OPENROUTER] VITE_OPENROUTER_API_KEY:","Found"),console.log("[OPENROUTER] Found env var: VITE_OPENROUTER_API_KEY =","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".substring(0,15)+"..."),!(a!=null&&a.trim())){console.error("[OPENROUTER] ❌ API key not found in any of the expected environment variables"),console.error("[OPENROUTER] Expected format in .env.local: VITE_OPENROUTER_API_KEY=sk-or-v1-..."),console.error("[OPENROUTER] Make sure to restart the development server after adding the API key");return}this.apiKey=a.trim(),this.isInitialized=!0,console.log("[OPENROUTER] ✅ Service initialized successfully"),console.log("[OPENROUTER] API key found:",this.apiKey.substring(0,15)+"..."),console.log("[OPENROUTER] API key length:",this.apiKey.length),this.apiKey.startsWith("sk-or-v1-")||console.warn('[OPENROUTER] ⚠️ API key does not start with expected prefix "sk-or-v1-"')}isReady(){const a={hasApiKey:this.apiKey!==null,isInitialized:this.isInitialized,ready:this.isInitialized&&this.apiKey!==null};return console.log("[OPENROUTER] Service ready check:",a),a.ready}async makeRequest(a,e=.7,r=4e3,t="nvidia/llama-3.1-nemotron-ultra-253b-v1:free"){var o,l,g;if(!this.apiKey)throw new Error("OpenRouter service not initialized - API key missing");console.log("[OPENROUTER] Making API request with",a.length,"messages, max tokens:",r,"model:",t);const s=new AbortController,c=setTimeout(()=>{console.log("[OPENROUTER] Request timeout after 90 seconds"),s.abort()},9e4);try{const n=await fetch(this.baseUrl,{method:"POST",headers:{Authorization:`Bearer ${this.apiKey}`,"Content-Type":"application/json","HTTP-Referer":window.location.origin,"X-Title":"Fine Format - AI Dataset Generator"},body:JSON.stringify({model:t,messages:a,temperature:e,max_tokens:r,stream:!1,top_p:.95,frequency_penalty:.1,presence_penalty:.1}),signal:s.signal});if(clearTimeout(c),!n.ok){const i=await n.text();throw console.error("[OPENROUTER] API error:",n.status,n.statusText,i),new Error(`OpenRouter API error: ${n.status} ${n.statusText} - ${i}`)}const d=await n.json();if(!((g=(l=(o=d.choices)==null?void 0:o[0])==null?void 0:l.message)!=null&&g.content))throw console.error("[OPENROUTER] Invalid response structure:",d),new Error("Invalid response from OpenRouter API");const u=d.choices[0].message.content;return console.log("[OPENROUTER] Request successful, response length:",u.length),d.choices[0].finish_reason==="length"&&console.warn("[OPENROUTER] ⚠️ Response was truncated due to max_tokens limit. Consider increasing max_tokens."),u}catch(n){throw clearTimeout(c),n.name==="AbortError"?(console.error("[OPENROUTER] Request aborted due to timeout"),new Error("OpenRouter API request timed out after 90 seconds")):(console.error("[OPENROUTER] Request failed:",n),n)}}parseJsonResponse(a){console.log("[OPENROUTER] Parsing JSON response, length:",a.length);let e=a.trim();const r=/^```(?:json)?\s*\n?(.*?)\n?\s*```$/s,t=e.match(r);t!=null&&t[1]&&(e=t[1].trim(),console.log("[OPENROUTER] Removed code fences from response"));const s=/\[\s*\{/,c=/\}\s*\]$/,o=e.search(s),l=e.search(c);if(o!==-1&&l!==-1&&o<l){const g=e.substring(o,l+2);console.log("[OPENROUTER] Extracted JSON array from position",o,"to",l+2);try{const n=JSON.parse(g);Array.isArray(n)&&(e=g,console.log("[OPENROUTER] Using extracted JSON array with",n.length,"items"))}catch{console.warn("[OPENROUTER] Extracted JSON is invalid, trying cleanup on original")}}return e=this.cleanJsonString(e),this.parseWithRecovery(e,a)}cleanJsonString(a){return a.replace(/,(\s*[}\]])/g,"$1").replace(/\\\\/g,"\\").replace(/\\n/g,"\\n").replace(/\\t/g,"\\t").replace(/\\r/g,"\\r").replace(/[\x00-\x1F\x7F]/g,"").replace(/[^\x20-\x7E\n\r\t]/g,"")}parseWithRecovery(a,e){try{const r=JSON.parse(a);if(Array.isArray(r))return console.log("[OPENROUTER] ✅ Direct parsing successful with",r.length,"items"),r;throw new Error("Response is not a JSON array")}catch(r){console.warn("[OPENROUTER] Stage 1 parsing failed:",r.message);try{const t=r.message.match(/position (\d+)/);if(t){const s=parseInt(t[1],10);if(console.error("[OPENROUTER] JSON parsing failed around position",s),s>=0&&s<a.length){console.error("[OPENROUTER] character:",a.charAt(s));const c=Math.max(0,s-50),o=Math.min(a.length,s+50);console.error("[OPENROUTER] Context:",a.substring(c,o))}}}catch(t){console.warn("[OPENROUTER] Error during debug logging:",t.message)}}try{let r=this.fixStructuralIssues(a);const t=JSON.parse(r);if(Array.isArray(t))return console.log("[OPENROUTER] ✅ Stage 2 parsing successful with",t.length,"items"),t;throw new Error("Fixed response is not a JSON array")}catch(r){console.warn("[OPENROUTER] Stage 2 parsing failed:",r.message)}try{const r=this.extractIndividualObjects(a);if(r.length>0)return console.log("[OPENROUTER] ✅ Stage 3 extraction successful with",r.length,"objects"),r}catch(r){console.warn("[OPENROUTER] Stage 3 extraction failed:",r.message)}try{const r=this.extractPartialData(e);if(r.length>0)return console.log("[OPENROUTER] ⚠️ Stage 4 partial extraction with",r.length,"objects"),r}catch(r){console.warn("[OPENROUTER] Stage 4 partial extraction failed:",r.message)}throw console.error("[OPENROUTER] ❌ All parsing stages failed"),console.error("[OPENROUTER] Original response length:",e.length),console.error("[OPENROUTER] Processed JSON length:",a.length),console.error("[OPENROUTER] First 500 chars of original:",e.substring(0,500)),console.error("[OPENROUTER] First 500 chars of processed:",a.substring(0,500)),new Error("Failed to parse JSON response after all recovery attempts. Response may be malformed or truncated.")}fixStructuralIssues(a){let e=a;const r=(e.match(/\[/g)||[]).length,t=(e.match(/\]/g)||[]).length,s=(e.match(/\{/g)||[]).length,c=(e.match(/\}/g)||[]).length;if(console.log("[OPENROUTER] Bracket/brace count:",{openBrackets:r,closeBrackets:t,openBraces:s,closeBraces:c}),s>c){const o=s-c;console.log("[OPENROUTER] Adding",o,"missing closing braces"),e+="}".repeat(o)}if(r>t){const o=r-t;console.log("[OPENROUTER] Adding",o,"missing closing brackets"),e+="]".repeat(o)}return e}extractIndividualObjects(a){console.log("[OPENROUTER] Attempting individual object extraction");const e=/\{(?:[^{}]|{[^{}]*})*\}/g,r=a.match(e)||[];console.log("[OPENROUTER] Found",r.length,"potential JSON objects");const t=[];for(let s=0;s<r.length;s++)try{const c=JSON.parse(r[s]);c&&typeof c=="object"&&typeof c.user=="string"&&typeof c.model=="string"&&typeof c.isCorrect=="boolean"&&(t.push(c),console.log("[OPENROUTER] Valid object",s+1,"extracted"))}catch(c){console.warn("[OPENROUTER] Failed to parse object",s+1,":",c.message)}return t}extractPartialData(a){console.log("[OPENROUTER] Attempting partial data extraction as last resort");const e=[/"user":\s*"([^"]+)"/g,/"model":\s*"([^"]+)"/g,/"isCorrect":\s*(true|false)/g],r=[...a.matchAll(e[0])].map(o=>o[1]),t=[...a.matchAll(e[1])].map(o=>o[1]),s=[...a.matchAll(e[2])].map(o=>o[1]==="true"),c=Math.min(r.length,t.length,s.length);if(c>0){console.log("[OPENROUTER] Extracted",c,"partial Q&A pairs");const o=[];for(let l=0;l<c;l++)o.push({user:r[l],model:t[l],isCorrect:s[l],confidence:s[l]?.8:.3,targetGap:`gap_${l+1}`,generationReasoning:"Extracted from partial response"});return o}return[]}async generateValidationContext(a,e,r,t,s,c="knowledge"){console.log("[OPENROUTER] Generating validation context for synthetic Q&A pairs");const o=h.find(n=>n.id===c),l=`You are an expert dataset analyst and validation specialist. Your task is to create a comprehensive validation reference that will be used to efficiently validate synthetic Q&A pairs.

EXPERTISE AREAS:
- Domain knowledge extraction and synthesis
- Quality assessment frameworks
- Fine-tuning dataset optimization
- Knowledge gap analysis
- Factual accuracy verification

OBJECTIVE: Create a concise but comprehensive validation context that captures all essential information needed to validate synthetic Q&A pairs without requiring access to the full original content.`,g=`Create a comprehensive validation context for synthetic Q&A pair validation.

FINE-TUNING GOAL: ${o==null?void 0:o.name}
FOCUS: ${o==null?void 0:o.promptFocus}

DATASET OVERVIEW:
- Original content themes: ${e.join(", ")}
- Initial Q&A pairs: ${r.length} (${r.filter(n=>n.isCorrect).length} correct, ${r.filter(n=>!n.isCorrect).length} incorrect)
- Knowledge gaps identified: ${t.length}
- Synthetic pairs to validate: ${s.length}

KNOWLEDGE GAPS TO ADDRESS:
${t.map(n=>`• ${n.id}: ${n.description} (Priority: ${n.priority})
  - Suggested question types: ${n.suggestedQuestionTypes.join(", ")}
  - Related concepts: ${n.relatedConcepts.join(", ")}`).join(`
`)}

ORIGINAL CONTENT REFERENCE:
---
${a.substring(0,8e3)}${a.length>8e3?`
[Content truncated for context generation]`:""}
---

VALIDATION CONTEXT REQUIREMENTS:

1. **CORE KNOWLEDGE BASE**
   - Extract and synthesize key factual information
   - Identify authoritative statements and data points
   - Note important relationships and dependencies
   - Highlight domain-specific terminology and concepts

2. **QUALITY STANDARDS** (based on initial dataset)
   - Question complexity and clarity standards
   - Answer completeness and accuracy requirements
   - Appropriate level of detail for the domain
   - Consistency in tone and style

3. **GAP-SPECIFIC VALIDATION CRITERIA**
   - For each knowledge gap, define what constitutes effective coverage
   - Specify the types of questions that would address each gap
   - Identify key concepts that synthetic pairs should demonstrate

4. **FINE-TUNING ALIGNMENT**
   - Ensure synthetic pairs support the ${o==null?void 0:o.name} objective
   - Validate alignment with ${o==null?void 0:o.promptFocus}
   - Check for appropriate difficulty progression
   - Verify relevance to the target use case

5. **VALIDATION GUIDELINES**
   - Clear criteria for factual accuracy assessment
   - Standards for relevance and usefulness
   - Guidelines for identifying high-quality vs. low-quality pairs
   - Red flags that indicate problematic content

Create a structured validation context (1500-2000 words) that will serve as the primary reference for validating each synthetic Q&A pair efficiently and accurately.`;try{console.log("[OPENROUTER] Sending validation context generation request");const n=await this.makeRequest([{role:"system",content:l},{role:"user",content:g}],.3,3500);return console.log("[OPENROUTER] Validation context generated successfully, length:",n.length),n.trim()}catch(n){throw console.error("[OPENROUTER] Validation context generation failed:",n),new Error(`Validation context generation failed: ${n.message||"Unknown error"}`)}}async validateQAPair(a,e,r="knowledge"){console.log("[OPENROUTER] Validating Q&A pair using generated validation context");const t=h.find(o=>o.id===r),s=`You are an expert fact-checker and Q&A validator specializing in fine-tuning dataset quality assurance.

EXPERTISE:
- Factual accuracy verification
- Content relevance assessment
- Quality standard enforcement
- Knowledge gap coverage evaluation
- Fine-tuning dataset optimization

TASK: Validate a synthetic Q&A pair against the provided validation context and return a precise JSON assessment.`,c=`Validate this synthetic Q&A pair against the validation context.

FINE-TUNING GOAL: ${t==null?void 0:t.name}
FOCUS: ${t==null?void 0:t.promptFocus}

SYNTHETIC Q&A PAIR:
Question: "${a.user}"
Answer: "${a.model}"
Claimed Correctness: ${a.isCorrect?"CORRECT":"INCORRECT"}
Target Gap: ${a.targetGap}
Generation Reasoning: ${a.generationReasoning||"Not provided"}

VALIDATION CONTEXT:
---
${e}
---

VALIDATION CRITERIA:
1. **Factual Accuracy**: Is the answer factually correct based on the validation context?
2. **Relevance**: Does the Q&A pair align with the ${t==null?void 0:t.name} objective?
3. **Quality**: Is the answer comprehensive, clear, and well-structured?
4. **Consistency**: Does the claimed correctness match the actual accuracy?
5. **Gap Alignment**: Does this pair effectively address the target knowledge gap?
6. **Fine-tuning Value**: Will this improve model performance for ${t==null?void 0:t.promptFocus}?

Respond with ONLY a valid JSON object:
{
  "isValid": boolean,
  "confidence": number,
  "reasoning": "Brief explanation",
  "suggestedCorrection": "If invalid, suggest correction",
  "factualAccuracy": number,
  "relevanceScore": number
}`;try{console.log("[OPENROUTER] Sending validation request using validation context");const o=await this.makeRequest([{role:"system",content:s},{role:"user",content:c}],.2,1e3);console.log("[OPENROUTER] Received validation response, parsing JSON");let l=o.trim();const g=/^```(?:json)?\s*\n?(.*?)\n?\s*```$/s,n=l.match(g);n!=null&&n[1]&&(l=n[1].trim());const d=l.indexOf("{"),u=l.lastIndexOf("}");d!==-1&&u!==-1&&d<u&&(l=l.substring(d,u+1));const i=JSON.parse(l);if(typeof i.isValid!="boolean"||typeof i.confidence!="number"||typeof i.reasoning!="string"||typeof i.factualAccuracy!="number"||typeof i.relevanceScore!="number")throw new Error("Invalid validation response structure");return console.log(`[OPENROUTER] Validation successful: valid=${i.isValid}, confidence=${i.confidence}`),{isValid:i.isValid,confidence:Math.max(0,Math.min(1,i.confidence)),reasoning:i.reasoning,suggestedCorrection:i.suggestedCorrection||void 0,factualAccuracy:Math.max(0,Math.min(1,i.factualAccuracy)),relevanceScore:Math.max(0,Math.min(1,i.relevanceScore))}}catch(o){return console.error("[OPENROUTER] Q&A validation failed:",o),{isValid:!1,confidence:.1,reasoning:`Validation failed due to error: ${o.message||"Unknown error"}`,factualAccuracy:.1,relevanceScore:.1}}}async generateSyntheticQAPairsForGap(a,e,r="knowledge",t=10){console.log(`[OPENROUTER] Generating ${t} synthetic Q&A pairs for gap: ${e.id}`);const s=h.find(n=>n.id===r),c=Math.max(1,Math.ceil(t*p)),o=t-c,l=`You are an expert synthetic Q&A generator specializing in creating high-quality training data for fine-tuning language models.

EXPERTISE:
- Domain knowledge synthesis
- Question generation across difficulty levels
- Answer quality optimization
- Knowledge gap targeting
- Fine-tuning dataset construction

OBJECTIVE: Generate exactly ${t} synthetic Q&A pairs that specifically address the identified knowledge gap while maintaining high quality and relevance for ${s==null?void 0:s.name} fine-tuning.

QUALITY STANDARDS:
- Questions must be natural, clear, and appropriately challenging
- Answers must be comprehensive yet concise
- Content must be factually grounded in the provided reference material
- Incorrect answers should be plausible but clearly wrong to aid model discrimination
- All pairs must directly address the specified knowledge gap`,g=`Generate exactly ${t} high-quality synthetic Q&A pairs to address this specific knowledge gap.

FINE-TUNING GOAL: ${s==null?void 0:s.name}
FOCUS: ${s==null?void 0:s.promptFocus}

TARGET KNOWLEDGE GAP:
ID: ${e.id}
Description: ${e.description}
Theme: ${e.theme}
Priority: ${e.priority}
Suggested Question Types: ${e.suggestedQuestionTypes.join(", ")}
Related Concepts: ${e.relatedConcepts.join(", ")}

GENERATION REQUIREMENTS:
- Generate exactly ${o} CORRECT answers and ${c} INCORRECT answers
- Questions should vary in complexity and approach
- Cover different aspects of the knowledge gap
- Ensure answers are appropriate for the ${s==null?void 0:s.name} objective
- Incorrect answers should be plausible but factually wrong
- All content must be grounded in the reference material

REFERENCE CONTENT:
---
${a.substring(0,6e3)}${a.length>6e3?`
[Content truncated for generation focus]`:""}
---

CRITICAL JSON FORMAT REQUIREMENTS:
1. Respond with ONLY a valid JSON array
2. No explanations, markdown, or code blocks
3. Start immediately with [ and end with ]
4. Each object must have: "user", "model", "isCorrect", "confidence", "targetGap", "generationReasoning"
5. Properly escape all strings (use \\" for quotes, \\n for newlines)
6. No unescaped control characters

EXAMPLE FORMAT:
[
  {
    "user": "What is the primary concept discussed in relation to [topic]?",
    "model": "The primary concept is [detailed answer based on reference content]",
    "isCorrect": true,
    "confidence": 0.9,
    "targetGap": "${e.id}",
    "generationReasoning": "Addresses core understanding gap in ${e.theme}"
  }
]

Generate exactly ${t} Q&A pairs now:`;try{console.log(`[OPENROUTER] Sending request for gap ${e.id} using Nvidia Nemotron model`);const n=await this.makeRequest([{role:"system",content:l},{role:"user",content:g}],.6,5e3,"nvidia/llama-3.1-nemotron-ultra-253b-v1:free");console.log(`[OPENROUTER] Received response for gap ${e.id}, parsing JSON`);let d;try{d=this.parseJsonResponse(n)}catch(i){return console.error(`[OPENROUTER] Failed to parse JSON response for gap ${e.id}:`,i.message),console.warn(`[OPENROUTER] Returning empty array for gap ${e.id} due to parsing failure`),[]}if(!Array.isArray(d))return console.error(`[OPENROUTER] Response for gap ${e.id} is not a valid JSON array`),[];console.log(`[OPENROUTER] Filtering and validating synthetic pairs for gap ${e.id}`);const u=d.filter(i=>i&&typeof i.user=="string"&&typeof i.model=="string"&&typeof i.isCorrect=="boolean"&&i.user.trim().length>0&&i.model.trim().length>0).map(i=>({...i,source:"synthetic",confidence:i.confidence||(i.isCorrect?.9:.2),validationStatus:"pending",targetGap:e.id,generationReasoning:i.generationReasoning||`Generated to address ${e.description}`}));return console.log(`[OPENROUTER] Gap ${e.id} generation completed:`,{requested:t,generated:d.length,valid:u.length,correct:u.filter(i=>i.isCorrect).length,incorrect:u.filter(i=>!i.isCorrect).length}),u.length===0?(console.warn(`[OPENROUTER] No valid Q&A pairs could be extracted for gap ${e.id}`),[]):u}catch(n){return console.error(`[OPENROUTER] Synthetic Q&A generation failed for gap ${e.id}:`,n),console.warn(`[OPENROUTER] Returning empty array for gap ${e.id} due to generation failure`),[]}}async generateSyntheticQAPairs(a,e,r="knowledge",t=E,s){if(console.log("[OPENROUTER] Starting individual gap-based synthetic Q&A generation"),console.log("[OPENROUTER] Parameters:",{contentLength:a.length,gapCount:e.length,fineTuningGoal:r,targetCount:t}),e.length===0)return console.warn("[OPENROUTER] No knowledge gaps provided"),[];const c=Math.min(15,Math.ceil(t/e.length)),o=c*e.length;console.log(`[OPENROUTER] Generating ${c} pairs per gap for ${e.length} gaps (${o} total)`);const l=[],g=[];for(let n=0;n<e.length;n++){const d=e[n];try{console.log(`[OPENROUTER] Processing gap ${n+1}/${e.length}: ${d.id}`),s&&s(n,e.length,d.id);const u=await this.generateSyntheticQAPairsForGap(a,d,r,c);l.push(...u),console.log(`[OPENROUTER] Successfully generated ${u.length} pairs for gap ${d.id}`),n<e.length-1&&await new Promise(i=>setTimeout(i,1500))}catch(u){console.error(`[OPENROUTER] Failed to generate pairs for gap ${d.id}:`,u),g.push(d.id)}}if(s&&s(e.length,e.length,"completed"),console.log("[OPENROUTER] Individual gap processing completed:",{totalGaps:e.length,successfulGaps:e.length-g.length,failedGaps:g.length,totalPairsGenerated:l.length,correctPairs:l.filter(n=>n.isCorrect).length,incorrectPairs:l.filter(n=>!n.isCorrect).length}),g.length>0&&console.warn("[OPENROUTER] Some gaps failed to generate pairs:",g),l.length===0)throw new Error("No synthetic Q&A pairs could be generated for any knowledge gaps");return this.shuffleArray(l)}shuffleArray(a){const e=[...a];for(let r=e.length-1;r>0;r--){const t=Math.floor(Math.random()*(r+1));[e[r],e[t]]=[e[t],e[r]]}return e}}const m=new R;export{m as openRouterService};
