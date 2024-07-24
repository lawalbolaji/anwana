# need to set GROQ_API_KEY or script will fail

curl -w "@./scripts/curl_format.txt" -so /dev/null https://api.groq.com/openai/v1/audio/transcriptions \
    -H "Authorization: bearer ${GROQ_API_KEY}" \
    -F "file=@./public/introduction.mp3" \
    -F model=whisper-large-v3 \
    -F response_format=json
