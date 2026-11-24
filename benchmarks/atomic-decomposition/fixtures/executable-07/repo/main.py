from accounts import Profile

alice = Profile("alice", theme="dark")
bob = Profile("bob")
print(alice.user, alice.opts["theme"], alice.opts["channels"])
print(bob.user, bob.opts["theme"], bob.opts["channels"])
