import { defineSchema, t } from '@nublestation/blaze'

export const schema = defineSchema({
  file_comments: t.model({
    file_id:     t.string().required(),
    body:        t.string().required(),
    author_id:   t.string().required(),
    author_name: t.string().required(),
  }),
})
