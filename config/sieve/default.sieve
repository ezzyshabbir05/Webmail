# Default Postarc RFC 5228 Sieve Filter Script
require ["fileinto", "reject", "imap4flags"];

# Rule 1: Move suspected spam to Junk folder
if header :contains "X-Spam-Flag" "YES" {
    fileinto "spam";
    stop;
}

# Rule 2: Highlight core automated notifications
if header :contains "from" "noreply" {
    addflag "\\Seen";
}
