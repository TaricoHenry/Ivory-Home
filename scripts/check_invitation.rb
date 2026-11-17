#!/usr/bin/env ruby
# Validates an invitation's data file before a build. No gems needed.
#   ruby scripts/check_invitation.rb [path/to/_data/invitations/<slug>.yml]   (default: demo)
# Exits 1 with a list of problems, so CI (and agents) fail fast on bad data.

require "yaml"
require "date"
require "time"

ROOT = File.expand_path("..", __dir__)
path = ARGV[0] || File.join(ROOT, "_data", "invitations", "demo.yml")
images_dir = File.join(ROOT, "assets", "images")
sections_dir = File.join(ROOT, "_includes", "invitation", "sections")

begin
  data = YAML.safe_load(File.read(path), permitted_classes: [Date, Time], aliases: false)
rescue => e
  abort "✗ #{path} is not valid YAML: #{e.message}"
end

errors = []
warnings = []

dig = ->(*keys) { keys.reduce(data) { |node, key| node.is_a?(Hash) ? node[key] : nil } }
present = ->(value) { !(value.nil? || (value.respond_to?(:empty?) && value.empty?)) }
require_field = ->(*keys) { errors << "missing #{keys.join('.')}" unless present.(dig.(*keys)) }

# Required basics
[%w[id], %w[name], %w[host name], %w[site url], %w[site description], %w[datetime],
 %w[features rsvp], %w[sections]].each { |k| require_field.(*k) }

id = dig.("id").to_s
errors << "id must be lowercase-hyphenated (got #{id.inspect})" unless id.empty? || id.match?(/\A[a-z0-9]+(-[a-z0-9]+)*\z/)

dt = dig.("datetime")
begin
  Time.iso8601(dt.respond_to?(:iso8601) ? dt.iso8601 : dt.to_s) if present.(dt)
rescue ArgumentError
  errors << "datetime must be ISO 8601 with an offset, e.g. 2026-12-13T18:00:00-04:00"
end

url = dig.("site", "url").to_s
errors << "site.url must start with https:// and have no trailing slash" unless url.empty? || (url.start_with?("https://") && !url.end_with?("/"))

api = dig.("backend", "api_base").to_s
errors << "backend.api_base must start with https:// and end with /" unless api.empty? || (api.start_with?("https://") && api.end_with?("/"))

# Features
features = dig.("features") || {}
rsvp = features["rsvp"]
errors << "features.rsvp must be open, personal, form or none" unless %w[open personal form none].include?(rsvp)
errors << "features.contributions needs features.rsvp: open" if features["contributions"] && rsvp != "open"

endpoints = dig.("backend", "endpoints") || {}
needs = []
needs << "registrations" if rsvp == "open"
needs += %w[token_status token_details token_reply] if rsvp == "personal"
# A form posts to `submissions`, sends a notification email, or both.
notify = dig.("backend", "notifications") || {}
email_on = present.(notify["api_base"]) && present.(notify["api_key"]) && present.(dig.("notification_email", "to"))
if present.(notify["api_base"]) || present.(dig.("notification_email"))
  errors << "backend.notifications.api_base must start with https://" unless notify["api_base"].to_s.start_with?("https://")
  errors << "notification_email.to is required when emails are configured" unless present.(dig.("notification_email", "to"))
  errors << "notification_email.subject is required when emails are configured" unless present.(dig.("notification_email", "subject"))
  warnings << "backend.notifications.api_key is empty, so no emails will be sent" unless present.(notify["api_key"])
end
needs << "submissions" if rsvp == "form" && !email_on
if present.(dig.("guest_email"))
  errors << "guest_email.subject is required" unless present.(dig.("guest_email", "subject"))
  errors << "guest_email needs notification_email.to and backend.notifications.api_base (it is sent after that email)" unless present.(dig.("notification_email", "to")) && present.(notify["api_base"])
  warnings << "guest_email is set but the form has no email field to send it to" if rsvp == "form" && !(dig.("rsvp", "fields") || []).any? { |f| f["type"] == "email" }
end
needs << "food_items" if features["contributions"]

# Form fields
if rsvp == "form"
  fields = dig.("rsvp", "fields")
  if !fields.is_a?(Array) || fields.empty?
    errors << "rsvp.fields must list at least one field for features.rsvp: form"
  else
    names = []
    fields.each_with_index do |f, i|
      where = "rsvp.fields[#{i}]"
      unless f.is_a?(Hash) && present.(f["name"]) && present.(f["label"])
        errors << "#{where} needs a name and a label"
        next
      end
      errors << "#{where}.name must be camelCase letters/digits (got #{f['name'].inspect})" unless f["name"].to_s.match?(/\A[a-z][a-zA-Z0-9]*\z/)
      names << f["name"]
      type = f["type"] || "text"
      errors << "#{where}.type must be text, email, tel, textarea, select, choice or name" unless %w[text email tel textarea select choice name].include?(type)
      if %w[select choice].include?(type) && !(f["options"].is_a?(Array) && f["options"].any?) && !(type == "choice" && f["schedule"].is_a?(Hash))
        errors << "#{where} is a #{type}, so it needs options#{type == 'choice' ? ' or a schedule' : ''}"
      end
      if type == "choice" && f["schedule"].is_a?(Hash)
        sched = f["schedule"]
        hours = sched["hours"]
        if !hours.is_a?(Hash) || hours.empty?
          errors << "#{where}.schedule.hours needs at least one day"
        else
          hours.each do |day, ranges|
            errors << "#{where}.schedule.hours.#{day}: use weekdays, mon, tue, wed, thu, fri, sat or sun" unless %w[weekdays mon tue wed thu fri sat sun].include?(day)
            Array(ranges).each do |r|
              errors << "#{where}.schedule.hours.#{day}: #{r.inspect} should look like \"17:30-18:30\"" unless r.to_s.match?(/\A\d{2}:\d{2}-\d{2}:\d{2}\z/)
            end
          end
        end
        errors << "#{where}.schedule.utc_offset should look like \"-04:00\"" unless sched["utc_offset"].to_s.match?(/\A[+-]\d{2}:\d{2}\z/)
        blocked = sched["blocked"]
        if blocked.is_a?(Hash)
          %w[near_percent far_percent].each do |k|
            v = blocked[k]
            errors << "#{where}.schedule.blocked.#{k} must be a number from 0 to 100" unless v.nil? || (v.is_a?(Numeric) && v.between?(0, 100))
          end
          share = blocked["max_share"]
          errors << "#{where}.schedule.blocked.max_share must be between 0 and 1" unless share.nil? || (share.is_a?(Numeric) && share.between?(0, 1))
          if blocked.key?("count") || blocked.key?("day_multiple") || blocked.key?("day_of_year_multiple")
            warnings << "#{where}.schedule.blocked: count / day_multiple / day_of_year_multiple are no longer used (see near_percent, far_percent)"
          end
        end
      end
    end
    dupes = names.select { |n| names.count(n) > 1 }.uniq
    errors << "rsvp.fields has duplicate names: #{dupes.join(', ')}" if dupes.any?
  end
end
needs << "gallery_photos" if features["gallery"]
needs.each { |name| errors << "backend.endpoints.#{name} is required by the enabled features" unless present.(endpoints[name]) }
errors << "missing backend.api_base (needed by backend.endpoints)" if (needs.any? || endpoints.any?) && api.empty?

# Sections
sections = dig.("sections") || []
sections.each do |s|
  errors << "sections: no _includes/invitation/sections/#{s}.html" unless File.exist?(File.join(sections_dir, "#{s}.html"))
end
errors << "sections must include invitation when RSVP is enabled" if rsvp != "none" && !sections.include?("invitation")
warnings << "contributions enabled but not in sections" if features["contributions"] && !sections.include?("contributions")
warnings << "countdown enabled but not in sections" if features["countdown"] && !sections.include?("countdown")

# Colours
(dig.("theme", "colors") || {}).each do |name, value|
  errors << "theme.colors.#{name} must be a hex colour like #1d2b24" unless value.to_s.match?(/\A#(\h{3}|\h{6}|\h{8})\z/)
end
%w[ink paper primary accent on-dark].each do |name|
  warnings << "theme.colors.#{name} not set; template default will be used" unless present.(dig.("theme", "colors", name))
end

# Images referenced by name must exist
image_refs = {
  "site.share_image" => dig.("site", "share_image"),
  "site.favicon" => dig.("site", "favicon"),
  "site.favicon_png" => dig.("site", "favicon_png"),
  "host.logo" => dig.("host", "logo"),
  "host.nav_logo" => dig.("host", "nav_logo"),
  "hero.image" => dig.("hero", "image"),
  "hero.logo" => dig.("hero", "logo"),
  "invitation.background.image" => dig.("invitation", "background", "image"),
  "invitation.greeting_decor" => dig.("invitation", "greeting_decor"),
  "theme.pattern.image" => dig.("theme", "pattern", "image"),
}
(dig.("hero", "carousel") || []).each_with_index { |f, i| image_refs["hero.carousel[#{i}]"] = f }
(dig.("story") || []).each_with_index { |s, i| image_refs["story[#{i}].image"] = s["image"] }
image_refs.each do |field, file|
  next unless present.(file)
  errors << "#{field}: assets/images/#{file} not found" unless File.exist?(File.join(images_dir, file))
end
# Images inside *_html strings
YAML.dump(data).scan(%r{/assets/images/([\w./-]+)}).flatten.uniq.each do |file|
  errors << "an _html field references assets/images/#{file}, which is missing" unless File.exist?(File.join(images_dir, file))
end
%w[ivory-logo_white.svg ivory-logo_black.svg].each do |file|
  errors << "assets/images/#{file} missing (needed for the Ivory credit)" if features["ivory_credit"] && !File.exist?(File.join(images_dir, file))
end

warnings.each { |w| puts "! #{w}" }
if errors.empty?
  puts "✓ #{File.basename(path)} OK — #{dig.('name')} (#{rsvp} RSVP, sections: #{sections.join(', ')})"
else
  errors.each { |e| puts "✗ #{e}" }
  exit 1
end
