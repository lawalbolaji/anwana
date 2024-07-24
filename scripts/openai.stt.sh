# need to set OPENAI_API_KEY or script will fail

curl -w "@./scripts/curl_format.txt" -so /dev/null --request POST \
    --url https://api.openai.com/v1/audio/transcriptions \
    --header "Authorization: Bearer ${OPENAI_API_KEY}" \
    --header 'Content-Type: multipart/form-data' \
    --form file=@./public/introduction.mp3 \
    --form model=whisper-1
