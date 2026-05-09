the installer's substitution is using {VAR} syntax that produces literal {ensa} instead of ensa. Likely a sed or envsubst bug — probably should be ${VAR} with envsubst or {{VAR}} with a different tool. This is the "install validation" check I mentioned: a simple grep for { in the rendered Corefile would catch this before the stack starts.
this file works on staging
`ensa.local {
template IN A ensa.local {
answer "{{ .Name }} 60 IN A 192.168.1.162"
}
forward . 8.8.8.8 1.1.1.1
log
errors
}

. {
forward . 8.8.8.8 1.1.1.1
cache 30
log
errors
}