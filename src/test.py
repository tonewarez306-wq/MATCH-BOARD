import time
from google import genai
from google.genai import types
from notion_client import Client

# 👇 내 키 3개 입력
NOTION_TOKEN = "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"
NOTION_PAGE_ID = "3c691bead7fd80018b01e3f04649108d"
GEMINI_API_KEY = "AQ.Ab8RN6IJIyX8dD-Dcb0nc6YMGnoPQAFTJsJdhSraxLlfkx7CKg"

MODEL_NAME = "gemini-flash-latest"

notion = Client(auth=NOTION_TOKEN)
gemini = genai.Client(
    api_key=GEMINI_API_KEY,
    http_options=types.HttpOptions(timeout=15000)
)

def read_notion_page(page_id):
    blocks = notion.blocks.children.list(block_id=page_id)
    extracted_text = []
    text_block_types = [
        "paragraph", "heading_1", "heading_2", "heading_3",
        "bulleted_list_item", "numbered_list_item", "to_do", "quote", "callout"
    ]
    for block in blocks["results"]:
        b_type = block["type"]
        if b_type in text_block_types:
            rich_text = block[b_type].get("rich_text", [])
            line = "".join([t["plain_text"] for t in rich_text])
            if line.strip():
                extracted_text.append(line)
    return "\n".join(extracted_text)

def write_to_notion(page_id, ai_result):
    new_blocks = [
        {"object": "block", "type": "divider", "divider": {}},
        {
            "object": "block",
            "type": "heading_2",
            "heading_2": {
                "rich_text": [{"type": "text", "text": {"content": "🤖 제미나이 요약 및 QA 분석 결과"}}]
            }
        }
    ]
    for line in ai_result.split("\n"):
        clean_line = line.strip()
        if not clean_line:
            continue
        new_blocks.append({
            "object": "block",
            "type": "paragraph",
            "paragraph": {
                "rich_text": [{"type": "text", "text": {"content": clean_line[:2000]}}]
            }
        })
    notion.blocks.children.append(block_id=page_id, children=new_blocks[:100])

# 🚀 메인 실행 구간
print("1️⃣ 노션 페이지 읽는 중...")
page_content = read_notion_page(NOTION_PAGE_ID)

if not page_content:
    print("⚠️ 노션 페이지에 텍스트가 없어!")
    exit()

# 💡 따옴표 3개(""" """) 대신 리스트로 안전하게 연결!
prompt_lines = [
    "너는 시니어 SW QA 엔지니어이자 기획 분석가야.",
    "아래 노션 페이지 내용을 읽고 다음 두 가지를 깔끔하게 정리해 줘:",
    "1. [핵심 요약]: 전체 내용을 3줄 이내로 핵심만 요약",
    "2. [QA 체크포인트 & 엣지 케이스]: 확인할 주요 테스트 포인트 및 예외 케이스 도출",
    "",
    "[노션 페이지 내용]",
    page_content
]
prompt = "\n".join(prompt_lines)

print(f"2️⃣ [{MODEL_NAME}] 모델로 분석 중...")
response = None
for attempt in range(1, 4):
    try:
        response = gemini.models.generate_content(model=MODEL_NAME, contents=prompt)
        break
    except Exception as e:
        print(f"   ⚡ 서버 일시 지연 ({attempt}/3) - 2초 후 재시도...")
        time.sleep(2)

if not response:
    print("🚨 서버 응답 실패. 잠시 후 다시 실행해 봐!")
    exit()

print("3️⃣ 노션 페이지에 결과 작성 중...")
write_to_notion(NOTION_PAGE_ID, response.text)
print("🎉 완료! 노션 페이지를 확인해 봐!")